import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import Device, SensorReading, IrrigationSetting, IrrigationEvent, SystemAlert, ProposedAction
from backend.app.schemas.schemas import (
    DashboardOverviewResponse, SensorReadingResponse, IrrigationSettingSchema,
    IrrigationEventResponse, ProposedActionResponse
)
from backend.app.services.state_manager import state_manager
from backend.app.services.simulation_service import simulation_engine

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

def make_aware(dt: datetime.datetime) -> datetime.datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt

def compute_device_status(device: Device, now: datetime.datetime) -> str:
    if not device or not device.last_seen:
        return "OFFLINE"
    last_seen = make_aware(device.last_seen)
    delta = (now - last_seen).total_seconds()
    if delta < settings.STALE_DATA_TIMEOUT_SECONDS:
        return "ONLINE"
    elif delta < 600: # 10 mins
        return "STALE"
    else:
        return "OFFLINE"

@router.get("", response_model=DashboardOverviewResponse)
def get_dashboard_overview(db: Session = Depends(get_db)):
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # 1. Authoritative System Mode & Permission Model
    system_mode = state_manager.get_mode()
    permission_mode = state_manager.get_permission_mode()
    pump_state = state_manager.get_authoritative_pump_state()
    
    # 2. Irrigation Setting
    setting_orm = db.query(IrrigationSetting)\
        .filter(IrrigationSetting.device_id == settings.DEFAULT_ESP32_ID)\
        .first()
    if not setting_orm:
        setting_orm = IrrigationSetting(
            device_id=settings.DEFAULT_ESP32_ID,
            auto_mode_enabled=True,
            dry_threshold_percent=35.0,
            target_moisture_percent=70.0
        )
        db.add(setting_orm)
        db.commit()
        db.refresh(setting_orm)

    operating_mode = "AUTO" if setting_orm.auto_mode_enabled else "MANUAL"

    # 3. Mode-Specific Telemetry & Device Status Isolation
    if system_mode == "SIMULATION":
        system_status = "ONLINE"
        esp32_status = "ONLINE"
        rpi_status = "ONLINE"
        is_stale = False
        stale_warning = None
        sim_status = simulation_engine.get_status()

        # Build live simulated reading directly from running engine
        latest_reading_obj = SensorReadingResponse(
            id=0,
            device_id=settings.DEFAULT_ESP32_ID,
            timestamp=now,
            sequence=1,
            soil_moisture_raw=int(3200 - (simulation_engine.soil_moisture / 100.0) * 1800),
            soil_moisture_percent=round(simulation_engine.soil_moisture, 1),
            temperature_c=round(simulation_engine.temperature_c, 1),
            humidity_percent=round(simulation_engine.humidity_percent, 1),
            light_raw=simulation_engine.light_raw,
            light_percent=round((simulation_engine.light_raw / 4095.0) * 100.0, 1),
            rain_detected=simulation_engine.rain_detected,
            pump_state=pump_state,
            is_simulated=True,
            created_at=now
        )
    else:
        # HARDWARE MODE: Real device telemetry only
        sim_status = None
        esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
        rpi = db.query(Device).filter(Device.device_id == settings.DEFAULT_RPI_ID).first()
        
        esp32_status = compute_device_status(esp32, now)
        rpi_status = compute_device_status(rpi, now)
        
        if esp32_status == "ONLINE" and rpi_status == "ONLINE":
            system_status = "ONLINE"
        elif esp32_status == "ONLINE" or rpi_status == "ONLINE":
            system_status = "DEGRADED"
        else:
            system_status = "OFFLINE"

        # Query exclusively real (is_simulated == False) readings
        latest_hw_reading = db.query(SensorReading)\
            .filter(SensorReading.device_id == settings.DEFAULT_ESP32_ID, SensorReading.is_simulated == False)\
            .order_by(desc(SensorReading.timestamp))\
            .first()

        if latest_hw_reading:
            reading_time = make_aware(latest_hw_reading.timestamp)
            delta = (now - reading_time).total_seconds()
            if delta < settings.STALE_DATA_TIMEOUT_SECONDS:
                is_stale = False
                stale_warning = None
            else:
                is_stale = True
                mins = int(delta / 60)
                stale_warning = f"Sensor telemetry is stale (last reading received {mins}m ago). Automatic control paused."
            latest_reading_obj = SensorReadingResponse.model_validate(latest_hw_reading)
        else:
            is_stale = True
            stale_warning = "Hardware not connected. Connect and verify your devices in Settings."
            latest_reading_obj = None

    # 4. Latest Event (Filtered by Mode)
    latest_event_orm = db.query(IrrigationEvent)\
        .filter(IrrigationEvent.device_id == settings.DEFAULT_ESP32_ID)\
        .order_by(desc(IrrigationEvent.start_time))\
        .first()

    # 5. Active Alerts Count (Filtered by Active Mode)
    active_alerts = db.query(SystemAlert)\
        .filter(SystemAlert.source_mode == system_mode, SystemAlert.status == "ACTIVE")\
        .count()

    # 6. Pending Action (for ASK_BEFORE_ACTION permission mode)
    pending_action_orm = db.query(ProposedAction)\
        .filter(ProposedAction.status == "PENDING")\
        .order_by(desc(ProposedAction.created_at))\
        .first()

    return DashboardOverviewResponse(
        system_status=system_status,
        esp32_status=esp32_status,
        rpi_status=rpi_status,
        system_mode=system_mode,
        operating_mode=operating_mode,
        permission_mode=permission_mode,
        pump_state=pump_state,
        latest_reading=latest_reading_obj,
        settings=IrrigationSettingSchema.model_validate(setting_orm),
        latest_event=IrrigationEventResponse.model_validate(latest_event_orm) if latest_event_orm else None,
        is_stale=is_stale,
        stale_warning=stale_warning,
        active_alerts_count=active_alerts,
        simulation_status=sim_status,
        pending_action=ProposedActionResponse.model_validate(pending_action_orm) if pending_action_orm else None,
        server_time=now
    )
