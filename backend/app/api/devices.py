import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.models.models import Device, SensorReading, IrrigationCommand
from backend.app.services.mqtt_service import mqtt_service
from backend.app.services.state_manager import state_manager

router = APIRouter(prefix="/devices", tags=["Devices"])

def make_aware(dt: datetime.datetime) -> datetime.datetime:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt

@router.get("")
def list_devices(db: Session = Depends(get_db)):
    now = datetime.datetime.now(datetime.timezone.utc)
    active_mode = state_manager.get_operating_mode(db)
    active_pump_state = state_manager.get_authoritative_pump_state(db)
    
    # Query latest reading filtered strictly by operating mode
    is_sim_filter = (active_mode == "SIMULATION")
    latest_reading = db.query(SensorReading)\
        .filter(SensorReading.is_simulated == is_sim_filter)\
        .order_by(desc(SensorReading.timestamp))\
        .first()

    esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
    rpi = db.query(Device).filter(Device.device_id == settings.DEFAULT_RPI_ID).first()

    def get_status(dev: Optional[Device]) -> str:
        if not dev or not dev.last_seen:
            return "OFFLINE"
        last_seen = make_aware(dev.last_seen)
        diff = (now - last_seen).total_seconds()
        if diff < settings.STALE_DATA_TIMEOUT_SECONDS:
            return "ONLINE"
        elif diff < 600:
            return "STALE"
        return "OFFLINE"

    esp32_status = get_status(esp32)
    rpi_status = get_status(rpi)

    sensor_status = esp32_status if esp32_status in ["ONLINE", "STALE"] else "OFFLINE"

    devices_list = [
        {
            "id": "esp32",
            "device_id": settings.DEFAULT_ESP32_ID,
            "name": "ESP32 Field Controller",
            "type": "controller",
            "hardware": "ESP32 NodeMCU DevKit V1 30-Pin",
            "status": esp32_status,
            "firmware_version": esp32.firmware_version if esp32 else "v1.2.0-secure",
            "ip_address": esp32.ip_address if esp32 else "192.168.1.105",
            "last_seen": esp32.last_seen.isoformat() if (esp32 and esp32.last_seen) else None,
            "is_simulated": esp32.is_simulated if esp32 else False,
            "description": "Acquires analog/digital sensor telemetry, enforces local safety limits, and controls pump relay via GPIO.",
            "metrics": {
                "loop_frequency": "10s",
                "wifi_rssi": "-58 dBm",
                "adc_resolution": "12-bit (0-4095)"
            }
        },
        {
            "id": "rpi4b",
            "device_id": settings.DEFAULT_RPI_ID,
            "name": "Raspberry Pi 4B Edge Gateway",
            "type": "gateway",
            "hardware": "Raspberry Pi 4 Model B (4GB RAM)",
            "status": rpi_status,
            "firmware_version": "v1.0.4-edge-daemon",
            "ip_address": rpi.ip_address if rpi else "192.168.1.200",
            "last_seen": rpi.last_seen.isoformat() if (rpi and rpi.last_seen) else None,
            "is_simulated": rpi.is_simulated if rpi else False,
            "description": "Runs local Python rule engine, local SQLite telemetry buffer, and acts as Mosquitto MQTT broker host.",
            "metrics": {
                "cpu_temp": "42.8°C",
                "uptime": "14 days",
                "storage_used": "18%"
            }
        },
        {
            "id": "pump-zone-01",
            "device_id": "pump-zone-01",
            "name": "Submersible 12V DC Irrigation Pump",
            "type": "actuator",
            "hardware": "12V 24W Brushless DC Solar Diaphragm Pump",
            "status": "ONLINE" if (active_mode == "SIMULATION" or esp32_status == "ONLINE") else "OFFLINE",
            "pump_state": active_pump_state,
            "last_seen": esp32.last_seen.isoformat() if (esp32 and esp32.last_seen) else None,
            "description": "Controlled via optocoupled 5V relay module on ESP32 GPIO 23 with flyback diode protection.",
            "metrics": {
                "flow_rate": "2.5 L/min rated",
                "driver": "Optocoupled 10A Relay Module (Active HIGH)",
                "state": active_pump_state
            }
        },
        {
            "id": "sensor-moisture",
            "device_id": "sensor-soil-cap-01",
            "name": "Capacitive Soil Moisture Sensor v1.2",
            "type": "sensor",
            "hardware": "Corrosion-resistant capacitive probe (ESP32 ADC1_CH6 / GPIO 34)",
            "status": sensor_status,
            "last_seen": latest_reading.timestamp.isoformat() if latest_reading else None,
            "last_reading": f"{latest_reading.soil_moisture_percent:.1f}%" if (latest_reading and latest_reading.soil_moisture_percent is not None) else "No data",
            "raw_value": latest_reading.soil_moisture_raw if latest_reading else None,
            "description": "Measures volumetric water content without galvanic corrosion.",
            "metrics": {
                "calibrated_dry": "3200 raw",
                "calibrated_wet": "1400 raw"
            }
        },
        {
            "id": "sensor-dht22",
            "device_id": "sensor-dht22-01",
            "name": "DHT22 Digital Temp & Humidity",
            "type": "sensor",
            "hardware": "AM2302 capacitive humidity & thermistor (ESP32 GPIO 4)",
            "status": sensor_status,
            "last_seen": latest_reading.timestamp.isoformat() if latest_reading else None,
            "last_reading": f"{latest_reading.temperature_c:.1f}°C / {latest_reading.humidity_percent:.0f}% RH" if (latest_reading and latest_reading.temperature_c is not None) else "No data",
            "description": "High accuracy atmospheric temperature and relative humidity monitoring.",
            "metrics": {
                "temp_range": "-40 to 80°C (±0.5°C)",
                "humidity_range": "0-100% (±2%)"
            }
        },
        {
            "id": "sensor-ldr",
            "device_id": "sensor-ldr-01",
            "name": "LDR Ambient Light Sensor",
            "type": "sensor",
            "hardware": "5528 Photoresistor voltage divider (ESP32 ADC1_CH7 / GPIO 35)",
            "status": sensor_status,
            "last_seen": latest_reading.timestamp.isoformat() if latest_reading else None,
            "last_reading": f"{latest_reading.light_percent:.0f}% daylight" if (latest_reading and latest_reading.light_percent is not None) else "No data",
            "raw_value": latest_reading.light_raw if latest_reading else None,
            "description": "Measures relative solar irradiance to prevent midday evaporation losses.",
            "metrics": {
                "spectral_peak": "540 nm (human eye range)"
            }
        },
        {
            "id": "sensor-rain",
            "device_id": "sensor-rain-01",
            "name": "Optical / Resistive Rain Wetness Board",
            "type": "sensor",
            "hardware": "Interdigital nickel surface wetness detector (ESP32 GPIO 32)",
            "status": sensor_status,
            "last_seen": latest_reading.timestamp.isoformat() if latest_reading else None,
            "last_reading": "Rain Detected" if (latest_reading and latest_reading.rain_detected) else "Dry Surface",
            "description": "Detects surface precipitation to automatically pause scheduled irrigation cycles.",
            "metrics": {
                "response_time": "< 2 seconds upon droplet contact"
            }
        }
    ]

    return {
        "devices": devices_list,
        "count": len(devices_list),
        "timestamp": now.isoformat()
    }

@router.get("/{device_id}")
def get_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
    return device
