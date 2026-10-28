import io
import csv
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import SensorReading
from backend.app.schemas.schemas import SensorReadingResponse
from backend.app.services.state_manager import state_manager

router = APIRouter(prefix="/sensors", tags=["Sensors & Analytics Telemetry"])

@router.get("/latest", response_model=Optional[SensorReadingResponse])
def get_latest_sensor_reading(
    device_id: Optional[str] = None,
    mode: Optional[str] = None, # "simulation", "hardware"
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    active_mode = (mode or state_manager.get_mode()).upper()
    
    query = db.query(SensorReading).filter(SensorReading.device_id == target_id)
    if active_mode == "SIMULATION":
        query = query.filter(SensorReading.is_simulated == True)
    elif active_mode == "HARDWARE":
        query = query.filter(SensorReading.is_simulated == False)
        
    reading = query.order_by(desc(SensorReading.timestamp)).first()
    return reading

@router.get("/history", response_model=List[SensorReadingResponse])
def get_sensor_history(
    hours: Optional[int] = Query(24, ge=1, le=720, description="Hours of historical data to retrieve"),
    limit: Optional[int] = Query(500, ge=10, le=2000),
    device_id: Optional[str] = None,
    mode: Optional[str] = None, # "simulation", "hardware", or "all"
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    
    query = db.query(SensorReading)\
        .filter(SensorReading.device_id == target_id, SensorReading.timestamp >= since)
        
    # Strict mode isolation
    filter_mode = (mode or state_manager.get_mode()).lower()
    if filter_mode == "simulation":
        query = query.filter(SensorReading.is_simulated == True)
    elif filter_mode == "hardware":
        query = query.filter(SensorReading.is_simulated == False)

    readings = query.order_by(asc(SensorReading.timestamp)).limit(limit).all()
    return readings

@router.get("/export")
def export_sensor_data_csv(
    hours: Optional[int] = Query(168, ge=1, le=2160, description="Hours of data (default 7 days)"),
    device_id: Optional[str] = None,
    mode: Optional[str] = None,
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    
    query = db.query(SensorReading)\
        .filter(SensorReading.device_id == target_id, SensorReading.timestamp >= since)
        
    if mode == "simulation":
        query = query.filter(SensorReading.is_simulated == True)
    elif mode == "hardware":
        query = query.filter(SensorReading.is_simulated == False)
        
    readings = query.order_by(asc(SensorReading.timestamp)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp (UTC)",
        "Device ID",
        "Sequence",
        "Soil Moisture (%)",
        "Soil Moisture Raw",
        "Temperature (°C)",
        "Humidity (%)",
        "Light (%)",
        "Rain Detected",
        "Pump State",
        "Mode"
    ])

    for r in readings:
        writer.writerow([
            r.timestamp.isoformat(),
            r.device_id,
            r.sequence or "",
            f"{r.soil_moisture_percent:.1f}" if r.soil_moisture_percent is not None else "",
            r.soil_moisture_raw or "",
            f"{r.temperature_c:.1f}" if r.temperature_c is not None else "",
            f"{r.humidity_percent:.1f}" if r.humidity_percent is not None else "",
            f"{r.light_percent:.1f}" if r.light_percent is not None else "",
            "YES" if r.rain_detected else "NO",
            r.pump_state,
            "SIMULATION" if r.is_simulated else "HARDWARE"
        ])

    filename = f"smartirrigate_telemetry_{target_id}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
