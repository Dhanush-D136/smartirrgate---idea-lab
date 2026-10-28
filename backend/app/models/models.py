import datetime
import uuid
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="operator") # "admin", "operator"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    
    commands = relationship("IrrigationCommand", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), unique=True, index=True, nullable=False) # e.g. "esp32-zone-01"
    name = Column(String(255), nullable=False)
    device_type = Column(String(50), nullable=False) # "esp32", "raspberry_pi", "pump", "sensor"
    status = Column(String(50), default="OFFLINE") # "ONLINE", "OFFLINE", "STALE", "FAULT"
    firmware_version = Column(String(50), nullable=True)
    ip_address = Column(String(50), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    is_simulated = Column(Boolean, default=False)
    soil_raw_dry = Column(Integer, default=3200)
    soil_raw_wet = Column(Integer, default=1400)
    dht_type = Column(String(20), default="DHT22") # "DHT11", "DHT22"
    rain_active_low = Column(Boolean, default=True)
    sync_status = Column(String(50), default="SYNCED") # "SYNCED", "PENDING_SYNC", "SYNC_FAILED"
    last_sync_time = Column(DateTime(timezone=True), nullable=True)
    config_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class SensorReading(Base):
    __tablename__ = "sensor_readings"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    sequence = Column(Integer, nullable=True)
    soil_moisture_raw = Column(Integer, nullable=True)
    soil_moisture_percent = Column(Float, nullable=True) # calibrated 0.0 - 100.0%
    temperature_c = Column(Float, nullable=True)
    humidity_percent = Column(Float, nullable=True)
    light_raw = Column(Integer, nullable=True)
    light_percent = Column(Float, nullable=True)
    rain_detected = Column(Boolean, default=False)
    pump_state = Column(String(20), default="OFF") # "ON", "OFF", "UNKNOWN"
    is_simulated = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    
    __table_args__ = (
        Index("idx_device_timestamp", "device_id", "timestamp"),
    )

class DeviceHeartbeat(Base):
    __tablename__ = "device_heartbeats"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    battery_level = Column(Float, nullable=True)
    signal_strength = Column(Integer, nullable=True) # RSSI dBm
    uptime_seconds = Column(Integer, nullable=True)
    status = Column(String(50), default="ONLINE")
    created_at = Column(DateTime(timezone=True), default=utcnow)

class IrrigationSetting(Base):
    __tablename__ = "irrigation_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), unique=True, index=True, nullable=False)
    auto_mode_enabled = Column(Boolean, default=True)
    dry_threshold_percent = Column(Float, default=35.0) # Start watering below 35%
    target_moisture_percent = Column(Float, default=70.0) # Stop watering at 70%
    max_runtime_seconds = Column(Integer, default=300) # Max 5 mins continuous run
    cooldown_minutes = Column(Integer, default=30) # Minimum 30 mins between cycles
    rain_pause_enabled = Column(Boolean, default=True) # Pause if rain detected
    daylight_only = Column(Boolean, default=False) # Only water during daylight hours
    restricted_hours_start = Column(String(10), nullable=True) # e.g. "12:00"
    restricted_hours_end = Column(String(10), nullable=True) # e.g. "15:00"
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class IrrigationCommand(Base):
    __tablename__ = "irrigation_commands"
    
    id = Column(Integer, primary_key=True, index=True)
    command_id = Column(String(64), unique=True, index=True, default=lambda: str(uuid.uuid4()))
    device_id = Column(String(100), index=True, nullable=False)
    action = Column(String(50), nullable=False) # "START_PUMP", "STOP_PUMP", "EMERGENCY_STOP", "SET_MODE"
    parameters_json = Column(Text, nullable=True)
    issued_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(50), default="SENT") # "SENT", "ACKNOWLEDGED", "EXECUTED", "REJECTED", "EXPIRED", "TIMED_OUT"
    ack_received_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_pump_state = Column(String(20), nullable=True) # "ON", "OFF"
    rejection_reason = Column(String(255), nullable=True)
    issued_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    user = relationship("User", back_populates="commands")

class IrrigationEvent(Base):
    __tablename__ = "irrigation_events"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), index=True, nullable=False)
    trigger_type = Column(String(50), nullable=False) # "AUTO_THRESHOLD", "MANUAL_REMOTE", "EMERGENCY_STOP", "TARGET_REACHED", "COOLDOWN_TIMEOUT", "RAIN_DETECTED"
    action = Column(String(20), nullable=False) # "START", "STOP"
    start_time = Column(DateTime(timezone=True), default=utcnow)
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    water_volume_liters = Column(Float, nullable=True)
    start_soil_moisture = Column(Float, nullable=True)
    end_soil_moisture = Column(Float, nullable=True)
    reason = Column(String(255), nullable=True)
    triggered_by = Column(String(100), default="SYSTEM_AUTO")
    created_at = Column(DateTime(timezone=True), default=utcnow)

class SystemAlert(Base):
    __tablename__ = "system_alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), nullable=True)
    severity = Column(String(20), default="INFO") # "INFO", "WARNING", "ERROR", "CRITICAL"
    category = Column(String(50), default="SYSTEM") # "DEVICE", "PUMP", "SENSOR", "COMMUNICATION"
    title = Column(String(255), default="System Alert")
    message = Column(String(500), nullable=False)
    source_mode = Column(String(50), default="SIMULATION") # "SIMULATION", "HARDWARE"
    status = Column(String(50), default="ACTIVE") # "ACTIVE", "ACKNOWLEDGED", "RESOLVED"
    action_recommended = Column(String(255), nullable=True)
    details_json = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

class SystemState(Base):
    __tablename__ = "system_states"
    
    id = Column(Integer, primary_key=True)
    operating_mode = Column(String(50), default="SIMULATION") # "SIMULATION", "HARDWARE"
    permission_mode = Column(String(50), default="AUTHORIZED_AUTO") # "AUTHORIZED_AUTO", "ASK_BEFORE_ACTION", "MANUAL_CONTROL"
    authoritative_pump_state = Column(String(20), default="OFF") # "OFF", "STARTING", "RUNNING", "STOPPING", "FAULT", "UNKNOWN"
    pump_started_at = Column(DateTime(timezone=True), nullable=True)
    last_irrigation_end = Column(DateTime(timezone=True), nullable=True)
    active_session_id = Column(String(64), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class ProposedAction(Base):
    __tablename__ = "proposed_actions"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(50), nullable=False) # "START_IRRIGATION", "STOP_IRRIGATION"
    reason = Column(String(500), nullable=False)
    soil_moisture_percent = Column(Float, nullable=True)
    dry_threshold_percent = Column(Float, nullable=True)
    status = Column(String(50), default="PENDING") # "PENDING", "APPROVED", "REJECTED", "EXPIRED"
    created_at = Column(DateTime(timezone=True), default=utcnow)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decided_by = Column(String(255), nullable=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource = Column(String(100), nullable=False)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow)
    
    user = relationship("User", back_populates="audit_logs")

