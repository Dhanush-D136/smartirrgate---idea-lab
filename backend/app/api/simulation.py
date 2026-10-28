import datetime
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, Field
from typing import Optional
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import Device, SensorReading, IrrigationCommand, IrrigationEvent
from backend.app.services.simulation_service import simulation_engine
from backend.app.services.state_manager import state_manager

router = APIRouter(prefix="/simulation", tags=["Simulation Engine Controls"])

class SimulationControlAction(BaseModel):
    action: str = Field(..., description="'START', 'PAUSE', 'RESUME', 'STOP', 'RESET'")
    initial_moisture: Optional[float] = 29.5

class SetSpeedRequest(BaseModel):
    speed: int = Field(..., ge=1, le=10)

class SetMoistureRequest(BaseModel):
    soil_moisture_percent: float = Field(..., ge=5.0, le=95.0)

class SimulatedTelemetryRequest(BaseModel):
    soil_moisture_percent: float = 28.5
    temperature_c: float = 24.2
    humidity_percent: float = 65.0
    light_raw: int = 2100
    rain_detected: bool = False
    pump_state: Optional[str] = None

class SimulatedAckRequest(BaseModel):
    command_id: Optional[str] = None
    confirmed_pump_state: str # "ON" or "OFF"
    status: str = "ACKNOWLEDGED"

@router.get("/status")
def get_simulation_status():
    return {
        "status": "success",
        "system_mode": state_manager.get_mode(),
        "simulation": simulation_engine.get_status()
    }

@router.post("/control")
def control_simulation(req: SimulationControlAction):
    act = req.action.upper()
    if act == "START":
        simulation_engine.start_loop()
        state_manager.set_mode("SIMULATION")
        return {"status": "SUCCESS", "message": "Simulation started."}
    elif act == "PAUSE":
        simulation_engine.pause()
        return {"status": "SUCCESS", "message": "Simulation paused."}
    elif act == "RESUME":
        simulation_engine.resume()
        return {"status": "SUCCESS", "message": "Simulation resumed."}
    elif act == "STOP":
        simulation_engine.stop_pump("Simulation stopped by operator")
        simulation_engine.pause()
        return {"status": "SUCCESS", "message": "Simulation and pump stopped."}
    elif act == "RESET":
        simulation_engine.reset(req.initial_moisture or 29.5)
        return {"status": "SUCCESS", "message": f"Simulation reset with {req.initial_moisture or 29.5}% initial moisture."}
    else:
        raise HTTPException(status_code=400, detail="Invalid simulation control action.")

@router.post("/speed")
def set_simulation_speed(req: SetSpeedRequest):
    simulation_engine.set_speed(req.speed)
    return {"status": "SUCCESS", "speed": req.speed, "message": f"Simulation speed set to {req.speed}x."}

@router.post("/moisture")
def set_simulation_moisture(req: SetMoistureRequest):
    with simulation_engine.lock:
        simulation_engine.soil_moisture = req.soil_moisture_percent
    return {"status": "SUCCESS", "soil_moisture_percent": req.soil_moisture_percent}

@router.post("/toggle-rain")
def toggle_simulation_rain():
    state = simulation_engine.toggle_rain()
    return {"status": "SUCCESS", "rain_detected": state}

@router.post("/toggle-fault")
def toggle_simulation_fault():
    state = simulation_engine.toggle_sensor_fault()
    return {"status": "SUCCESS", "sensor_fault": state}

# Backward compatibility endpoints
@router.post("/telemetry")
def inject_simulated_telemetry(req: SimulatedTelemetryRequest, db: Session = Depends(get_db)):
    with simulation_engine.lock:
        simulation_engine.soil_moisture = req.soil_moisture_percent
        simulation_engine.temperature_c = req.temperature_c
        simulation_engine.humidity_percent = req.humidity_percent
        simulation_engine.light_raw = req.light_raw
        simulation_engine.rain_detected = req.rain_detected
        if req.pump_state:
            simulation_engine.pump_state = req.pump_state

    # Persist simulated reading
    reading = SensorReading(
        device_id=settings.DEFAULT_ESP32_ID,
        timestamp=datetime.datetime.now(datetime.timezone.utc),
        soil_moisture_percent=req.soil_moisture_percent,
        soil_moisture_raw=int(3200.0 - (req.soil_moisture_percent / 100.0) * 1800.0),
        temperature_c=req.temperature_c,
        humidity_percent=req.humidity_percent,
        light_raw=req.light_raw,
        light_percent=round((req.light_raw / 4095.0) * 100.0, 1),
        rain_detected=req.rain_detected,
        pump_state=req.pump_state or simulation_engine.pump_state or "OFF",
        is_simulated=True
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    return {"status": "success", "message": "Simulated telemetry updated"}

@router.post("/ack")
def inject_simulated_ack(req: SimulatedAckRequest, db: Session = Depends(get_db)):
    now = datetime.datetime.now(datetime.timezone.utc)
    # Find command by command_id or latest unacknowledged
    cmd = None
    if req.command_id:
        cmd = db.query(IrrigationCommand).filter(IrrigationCommand.command_id == req.command_id).first()
    if not cmd:
        cmd = db.query(IrrigationCommand)\
            .filter(IrrigationCommand.device_id == settings.DEFAULT_ESP32_ID)\
            .order_by(desc(IrrigationCommand.issued_at))\
            .first()

    if cmd:
        cmd.status = req.status or "ACKNOWLEDGED"
        cmd.confirmed_pump_state = req.confirmed_pump_state
        cmd.ack_received_at = now
        db.commit()

    if req.confirmed_pump_state == "ON":
        simulation_engine.start_pump(reason="Simulated ESP32 Relay ACK: Pump turned ON")
    else:
        simulation_engine.stop_pump(reason="Simulated ESP32 Relay ACK: Pump turned OFF")
        
    return {"status": "success", "message": f"Simulated pump state ACK: {req.confirmed_pump_state}"}


@router.post("/seed-demo-history")
def seed_demo_history(db: Session = Depends(get_db)):
    device_id = settings.DEFAULT_ESP32_ID
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Generate 24 hours of hourly readings
    base_moisture = 42.0
    for i in range(24, 0, -1):
        point_time = now - datetime.timedelta(hours=i)
        hour = point_time.hour
        temp = 21.0 + 7.0 * (1.0 if 11 <= hour <= 16 else 0.2) + random.uniform(-0.8, 0.8)
        humidity = 78.0 - 20.0 * (1.0 if 11 <= hour <= 16 else 0.1) + random.uniform(-2.0, 2.0)
        is_day = 6 <= hour <= 18
        light_raw = int(3200 + random.uniform(-200, 200)) if is_day else int(400 + random.uniform(-50, 50))
        light_pct = round((light_raw / 4095.0) * 100.0, 1)

        base_moisture = max(22.0, base_moisture - 0.7 + random.uniform(-0.1, 0.1))
        pump_state = "OFF"
        if base_moisture < 28.0 and hour in [8, 17]:
            base_moisture = 68.0
            pump_state = "ON"

        reading = SensorReading(
            device_id=device_id,
            timestamp=point_time,
            sequence=1000 - i,
            soil_moisture_raw=int(3200 - (base_moisture / 100.0) * 1800),
            soil_moisture_percent=round(base_moisture, 1),
            temperature_c=round(temp, 1),
            humidity_percent=round(humidity, 1),
            light_raw=light_raw,
            light_percent=light_pct,
            rain_detected=False,
            pump_state=pump_state,
            is_simulated=True
        )
        db.add(reading)

    db.commit()
    return {"status": "success", "message": "Seeded 24 hours of simulated baseline sensor readings"}
