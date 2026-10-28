import datetime
import time
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text, desc
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import Device, SensorReading, IrrigationCommand, SystemAlert, DeviceHeartbeat
from backend.app.schemas.schemas import DiagnosticsResponse
from backend.app.services.mqtt_service import mqtt_service

router = APIRouter(prefix="", tags=["Diagnostics & System Health"])

START_TIME = time.time()

def make_aware(dt: datetime.datetime) -> datetime.datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt

@router.get("/health")
def healthcheck(db: Session = Depends(get_db)):
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "mqtt": "connected" if mqtt_service.is_connected else "disconnected",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

@router.get("/system/diagnostics", response_model=DiagnosticsResponse)
def get_system_diagnostics(db: Session = Depends(get_db)):
    # 1. Check DB
    db_connected = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_connected = False

    # 2. Broker status
    mqtt_status = "CONNECTED" if mqtt_service.is_connected else "STANDALONE_READY"

    # 3. Heartbeats
    esp_hb = db.query(DeviceHeartbeat)\
        .filter(DeviceHeartbeat.device_id == settings.DEFAULT_ESP32_ID)\
        .order_by(desc(DeviceHeartbeat.timestamp))\
        .first()

    rpi_hb = db.query(DeviceHeartbeat)\
        .filter(DeviceHeartbeat.device_id == settings.DEFAULT_RPI_ID)\
        .order_by(desc(DeviceHeartbeat.timestamp))\
        .first()

    # 4. Latest telemetry
    latest_reading = db.query(SensorReading)\
        .filter(SensorReading.device_id == settings.DEFAULT_ESP32_ID)\
        .order_by(desc(SensorReading.timestamp))\
        .first()

    # 5. Last command
    last_cmd = db.query(IrrigationCommand)\
        .filter(IrrigationCommand.device_id == settings.DEFAULT_ESP32_ID)\
        .order_by(desc(IrrigationCommand.issued_at))\
        .first()

    # 6. Active alerts
    alerts = db.query(SystemAlert)\
        .order_by(desc(SystemAlert.created_at))\
        .limit(10)\
        .all()

    alert_dicts = [
        {
            "id": a.id,
            "severity": a.severity,
            "category": a.category,
            "message": a.message,
            "created_at": a.created_at.isoformat()
        }
        for a in alerts
    ]

    recent_errors = []
    if not mqtt_service.is_connected:
        recent_errors.append(f"MQTT Broker at {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT} unreachable (running in offline/simulator mode)")
    if latest_reading:
        reading_time = make_aware(latest_reading.timestamp)
        delta = (datetime.datetime.now(datetime.timezone.utc) - reading_time).total_seconds()
        if delta > settings.STALE_DATA_TIMEOUT_SECONDS:
            recent_errors.append(f"Telemetry stale: no sensor updates for {int(delta)} seconds")

    from backend.app.services.state_manager import state_manager

    return DiagnosticsResponse(
        backend_status="ONLINE",
        database_connected=db_connected,
        mqtt_broker_status=mqtt_status,
        operating_mode=state_manager.get_mode(),
        pump_state=state_manager.get_authoritative_pump_state(),
        last_esp32_heartbeat=esp_hb.timestamp if esp_hb else None,
        last_rpi_heartbeat=rpi_hb.timestamp if rpi_hb else None,
        last_telemetry_time=latest_reading.timestamp if latest_reading else None,
        last_command_time=last_cmd.issued_at if last_cmd else None,
        last_command_ack_status=last_cmd.status if last_cmd else None,
        recent_errors=recent_errors,
        active_alerts=alert_dicts,
        uptime_seconds=round(time.time() - START_TIME, 1)
    )

