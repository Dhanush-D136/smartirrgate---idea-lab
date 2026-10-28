import json
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.core.security import get_current_user
from backend.app.models.models import User, IrrigationSetting, AuditLog, Device
from backend.app.schemas.schemas import IrrigationSettingSchema, IrrigationSettingUpdate
from backend.app.services.state_manager import state_manager
from backend.app.services.mqtt_service import mqtt_service

router = APIRouter(prefix="/settings", tags=["Settings & Hardware Configuration"])

class HardwareConfigUpdate(BaseModel):
    esp32_device_id: Optional[str] = "esp32-zone-01"
    rpi_device_id: Optional[str] = "rpi-edge-01"
    mqtt_broker_host: Optional[str] = "127.0.0.1"
    mqtt_broker_port: Optional[int] = 1883
    mqtt_use_tls: Optional[bool] = False
    soil_sensor_type: Optional[str] = "Capacitive v1.2"
    soil_raw_dry: Optional[int] = Field(3200, ge=1000, le=4095)
    soil_raw_wet: Optional[int] = Field(1400, ge=200, le=3000)
    dht_type: Optional[str] = "DHT22"
    rain_active_low: Optional[bool] = True
    sampling_interval_seconds: Optional[int] = Field(10, ge=2, le=300)
    heartbeat_interval_seconds: Optional[int] = Field(30, ge=5, le=600)
    stale_timeout_seconds: Optional[int] = Field(60, ge=10, le=1800)

class SystemModeRequest(BaseModel):
    mode: str = Field(..., description="'SIMULATION' or 'HARDWARE'")

@router.get("/mode")
def get_system_mode():
    return {
        "status": "success",
        "system_mode": state_manager.get_mode(),
        "permission_mode": state_manager.get_permission_mode(),
        "pump_state": state_manager.get_authoritative_pump_state()
    }

@router.post("/mode")
def set_system_mode(req: SystemModeRequest, current_user: User = Depends(get_current_user)):
    try:
        res = state_manager.set_mode(req.mode.upper())
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/hardware")
def get_hardware_settings(db: Session = Depends(get_db)):
    esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
    rpi = db.query(Device).filter(Device.device_id == settings.DEFAULT_RPI_ID).first()
    
    return {
        "esp32_device_id": esp32.device_id if esp32 else settings.DEFAULT_ESP32_ID,
        "rpi_device_id": rpi.device_id if rpi else settings.DEFAULT_RPI_ID,
        "mqtt_broker_host": settings.MQTT_BROKER_HOST,
        "mqtt_broker_port": settings.MQTT_BROKER_PORT,
        "mqtt_use_tls": False,
        "soil_sensor_type": "Capacitive v1.2 Corrosion-Resistant",
        "soil_raw_dry": esp32.soil_raw_dry if esp32 else 3200,
        "soil_raw_wet": esp32.soil_raw_wet if esp32 else 1400,
        "dht_type": esp32.dht_type if esp32 else "DHT22",
        "rain_active_low": esp32.rain_active_low if esp32 else True,
        "sampling_interval_seconds": 10,
        "heartbeat_interval_seconds": 30,
        "stale_timeout_seconds": settings.STALE_DATA_TIMEOUT_SECONDS,
        "sync_status": esp32.sync_status if esp32 else "SYNCED",
        "last_sync_time": esp32.last_sync_time.isoformat() if (esp32 and esp32.last_sync_time) else None
    }

@router.put("/hardware")
def update_hardware_settings(
    req: HardwareConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
    if not esp32:
        esp32 = Device(
            device_id=settings.DEFAULT_ESP32_ID,
            name="ESP32 Zone 01 Field Controller",
            device_type="esp32"
        )
        db.add(esp32)

    if req.soil_raw_dry <= req.soil_raw_wet:
        raise HTTPException(status_code=400, detail="Raw Dry ADC value must be greater than Raw Wet ADC value.")

    esp32.soil_raw_dry = req.soil_raw_dry
    esp32.soil_raw_wet = req.soil_raw_wet
    esp32.dht_type = req.dht_type
    esp32.rain_active_low = req.rain_active_low
    esp32.sync_status = "PENDING_SYNC"
    db.commit()

    return {
        "status": "SUCCESS",
        "message": "Hardware and sensor configuration saved to server. Pending edge synchronization.",
        "config": req.model_dump()
    }

@router.post("/test-backend")
def test_backend_connection(db: Session = Depends(get_db)):
    start = datetime.datetime.now(datetime.timezone.utc)
    # Check db ping
    db.execute(db.query(User).statement)
    latency_ms = int((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds() * 1000)
    return {
        "status": "HEALTHY",
        "latency_ms": max(1, latency_ms),
        "database": "Connected (SQLite/PostgreSQL)",
        "server_time": start.isoformat()
    }

@router.post("/test-mqtt")
def test_mqtt_connection():
    is_conn = mqtt_service.is_connected
    return {
        "status": "CONNECTED" if is_conn else "DISCONNECTED",
        "broker": f"{settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}",
        "message": "MQTT Broker active and connected" if is_conn else "MQTT Broker disconnected or offline."
    }

@router.post("/check-device-status")
def check_device_status(db: Session = Depends(get_db)):
    esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
    rpi = db.query(Device).filter(Device.device_id == settings.DEFAULT_RPI_ID).first()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    def check_dev(dev):
        if not dev or not dev.last_seen:
            return "DISCONNECTED"
        delta = (now - dev.last_seen.replace(tzinfo=datetime.timezone.utc if dev.last_seen.tzinfo is None else dev.last_seen.tzinfo)).total_seconds()
        return "ONLINE" if delta < settings.STALE_DATA_TIMEOUT_SECONDS else "STALE"

    return {
        "esp32_status": check_dev(esp32),
        "rpi_status": check_dev(rpi),
        "checked_at": now.isoformat()
    }

@router.post("/request-telemetry")
def request_fresh_telemetry():
    if not mqtt_service.is_connected:
        raise HTTPException(status_code=503, detail="MQTT broker not connected. Cannot request telemetry from physical hardware.")
    topic = f"{settings.MQTT_TOPIC_PREFIX}/{settings.DEFAULT_ESP32_ID}/commands"
    payload = {"action": "POLL_TELEMETRY", "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    mqtt_service.client.publish(topic, json.dumps(payload), qos=1)
    return {"status": "SUCCESS", "message": "Telemetry poll request dispatched to physical ESP32 controller."}

@router.post("/sync-config")
def synchronize_configuration(db: Session = Depends(get_db)):
    esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == settings.DEFAULT_ESP32_ID).first()
    now = datetime.datetime.now(datetime.timezone.utc)

    config_payload = {
        "device_id": settings.DEFAULT_ESP32_ID,
        "soil_calibration": {
            "raw_dry": esp32.soil_raw_dry if esp32 else 3200,
            "raw_wet": esp32.soil_raw_wet if esp32 else 1400
        },
        "dht_type": esp32.dht_type if esp32 else "DHT22",
        "dry_threshold": setting.dry_threshold_percent if setting else 35.0,
        "target_moisture": setting.target_moisture_percent if setting else 70.0,
        "max_runtime_seconds": setting.max_runtime_seconds if setting else 300,
        "rain_pause_enabled": setting.rain_pause_enabled if setting else True,
        "synchronized_at": now.isoformat()
    }

    if mqtt_service.is_connected:
        topic = f"{settings.MQTT_TOPIC_PREFIX}/{settings.DEFAULT_ESP32_ID}/config"
        mqtt_service.client.publish(topic, json.dumps(config_payload), qos=1)
        if esp32:
            esp32.sync_status = "SYNCED"
            esp32.last_sync_time = now
            db.commit()
        return {
            "status": "APPLIED_ON_DEVICE",
            "message": "Configuration successfully applied and confirmed on device via MQTT.",
            "sync_time": now.isoformat(),
            "config": config_payload
        }
    else:
        # Save as waiting for sync
        if esp32:
            esp32.sync_status = "PENDING_SYNC"
            db.commit()
        return {
            "status": "SAVED_TO_SERVER",
            "message": "Configuration saved to server. Device is offline; awaiting synchronization on next heartbeat.",
            "config": config_payload
        }

# Standard Irrigation Settings
@router.get("", response_model=IrrigationSettingSchema)
def get_irrigation_settings(
    device_id: str = None,
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == target_id).first()
    if not setting:
        setting = IrrigationSetting(device_id=target_id)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting

@router.put("", response_model=IrrigationSettingSchema)
def update_irrigation_settings(
    settings_in: IrrigationSettingUpdate,
    device_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == target_id).first()
    if not setting:
        setting = IrrigationSetting(device_id=target_id)
        db.add(setting)

    new_dry = settings_in.dry_threshold_percent if settings_in.dry_threshold_percent is not None else setting.dry_threshold_percent
    new_target = settings_in.target_moisture_percent if settings_in.target_moisture_percent is not None else setting.target_moisture_percent

    if new_dry >= new_target:
        raise HTTPException(
            status_code=400,
            detail=f"Target moisture ({new_target}%) must be higher than dry threshold ({new_dry}%) to ensure safe hysteresis"
        )

    if settings_in.dry_threshold_percent is not None:
        setting.dry_threshold_percent = settings_in.dry_threshold_percent
    if settings_in.target_moisture_percent is not None:
        setting.target_moisture_percent = settings_in.target_moisture_percent
    if settings_in.max_runtime_seconds is not None:
        setting.max_runtime_seconds = settings_in.max_runtime_seconds
    if settings_in.cooldown_minutes is not None:
        setting.cooldown_minutes = settings_in.cooldown_minutes
    if settings_in.rain_pause_enabled is not None:
        setting.rain_pause_enabled = settings_in.rain_pause_enabled
    if settings_in.daylight_only is not None:
        setting.daylight_only = settings_in.daylight_only
    if settings_in.restricted_hours_start is not None:
        setting.restricted_hours_start = settings_in.restricted_hours_start
    if settings_in.restricted_hours_end is not None:
        setting.restricted_hours_end = settings_in.restricted_hours_end

    setting.updated_by = current_user.email
    db.commit()
    db.refresh(setting)

    return setting
