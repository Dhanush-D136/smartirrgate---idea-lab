import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# User schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None
    role: Optional[str] = "operator"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime.datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Device schemas
class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: str
    name: str
    device_type: str
    status: str
    firmware_version: Optional[str] = None
    ip_address: Optional[str] = None
    last_seen: Optional[datetime.datetime] = None
    is_simulated: bool
    created_at: datetime.datetime

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    config_json: Optional[str] = None

# Telemetry schemas
class TelemetryPayload(BaseModel):
    device_id: str
    timestamp: Optional[datetime.datetime] = None
    sequence: Optional[int] = None
    soil_moisture_raw: Optional[int] = None
    soil_moisture_percent: Optional[float] = None
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    light_raw: Optional[int] = None
    rain_detected: bool = False
    pump_state: Optional[str] = "OFF"
    is_simulated: bool = False

class SensorReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: str
    timestamp: datetime.datetime
    sequence: Optional[int] = None
    soil_moisture_raw: Optional[int] = None
    soil_moisture_percent: Optional[float] = None
    temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    light_raw: Optional[int] = None
    light_percent: Optional[float] = None
    rain_detected: bool
    pump_state: str
    is_simulated: bool
    created_at: datetime.datetime

# Irrigation Command Schemas
class CommandRequest(BaseModel):
    action: str = Field(..., description="START_PUMP, STOP_PUMP, EMERGENCY_STOP")
    device_id: Optional[str] = None
    duration_seconds: Optional[int] = Field(None, ge=10, le=1800, description="Max runtime limit in seconds")
    reason: Optional[str] = "Manual remote action"

class CommandResponse(BaseModel):
    command_id: str
    device_id: str
    action: str
    status: str
    issued_at: datetime.datetime
    expires_at: datetime.datetime
    confirmed_pump_state: Optional[str] = None
    message: str

class CommandAckPayload(BaseModel):
    command_id: str
    device_id: str
    status: str # "ACKNOWLEDGED", "REJECTED"
    confirmed_pump_state: str # "ON", "OFF"
    timestamp: Optional[datetime.datetime] = None
    error_message: Optional[str] = None

class ModeToggleRequest(BaseModel):
    device_id: Optional[str] = None
    auto_mode_enabled: bool

# Settings schemas
class IrrigationSettingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    device_id: str
    auto_mode_enabled: bool
    dry_threshold_percent: float
    target_moisture_percent: float
    max_runtime_seconds: int
    cooldown_minutes: int
    rain_pause_enabled: bool
    daylight_only: bool
    restricted_hours_start: Optional[str] = None
    restricted_hours_end: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: datetime.datetime

class IrrigationSettingUpdate(BaseModel):
    dry_threshold_percent: Optional[float] = Field(None, ge=10.0, le=80.0)
    target_moisture_percent: Optional[float] = Field(None, ge=30.0, le=95.0)
    max_runtime_seconds: Optional[int] = Field(None, ge=30, le=1800)
    cooldown_minutes: Optional[int] = Field(None, ge=5, le=360)
    rain_pause_enabled: Optional[bool] = None
    daylight_only: Optional[bool] = None
    restricted_hours_start: Optional[str] = None
    restricted_hours_end: Optional[str] = None

# Event schemas
class IrrigationEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: str
    trigger_type: str
    action: str
    start_time: datetime.datetime
    end_time: Optional[datetime.datetime] = None
    duration_seconds: Optional[int] = None
    water_volume_liters: Optional[float] = None
    start_soil_moisture: Optional[float] = None
    end_soil_moisture: Optional[float] = None
    reason: Optional[str] = None
    triggered_by: str
    created_at: datetime.datetime

# Alerts
class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    device_id: Optional[str] = None
    severity: str # "INFO", "WARNING", "ERROR", "CRITICAL"
    category: str # "DEVICE", "PUMP", "SENSOR", "COMMUNICATION"
    title: str
    message: str
    source_mode: str # "SIMULATION", "HARDWARE"
    status: str # "ACTIVE", "ACKNOWLEDGED", "RESOLVED"
    action_recommended: Optional[str] = None
    is_read: bool
    created_at: datetime.datetime
    resolved_at: Optional[datetime.datetime] = None

class ProposedActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    action: str
    reason: str
    soil_moisture_percent: Optional[float] = None
    status: str
    created_at: datetime.datetime

# System Mode & Permission Schemas
class SystemModeUpdateRequest(BaseModel):
    mode: str = Field(..., description="'SIMULATION' or 'HARDWARE'")

class PermissionModeUpdateRequest(BaseModel):
    permission_mode: str = Field(..., description="'AUTHORIZED_AUTO', 'ASK_BEFORE_ACTION', or 'MANUAL_CONTROL'")

# Dashboard Overview
class DashboardOverviewResponse(BaseModel):
    system_status: str # "ONLINE", "OFFLINE", "DEGRADED"
    esp32_status: str
    rpi_status: str
    system_mode: str # "SIMULATION", "HARDWARE"
    operating_mode: str # "AUTO", "MANUAL"
    permission_mode: str # "AUTHORIZED_AUTO", "ASK_BEFORE_ACTION", "MANUAL_CONTROL"
    pump_state: str # "OFF", "STARTING", "RUNNING", "STOPPING", "FAULT", "UNKNOWN"
    latest_reading: Optional[SensorReadingResponse] = None
    settings: Optional[IrrigationSettingSchema] = None
    latest_event: Optional[IrrigationEventResponse] = None
    is_stale: bool
    stale_warning: Optional[str] = None
    active_alerts_count: int
    simulation_status: Optional[Dict[str, Any]] = None
    pending_action: Optional[ProposedActionResponse] = None
    server_time: datetime.datetime

# System Health & Diagnostics
class DiagnosticsResponse(BaseModel):
    backend_status: str
    database_connected: bool
    mqtt_broker_status: str
    operating_mode: str
    pump_state: str
    last_esp32_heartbeat: Optional[datetime.datetime] = None
    last_rpi_heartbeat: Optional[datetime.datetime] = None
    last_telemetry_time: Optional[datetime.datetime] = None
    last_command_time: Optional[datetime.datetime] = None
    last_command_ack_status: Optional[str] = None
    recent_errors: List[str] = []
    active_alerts: List[Dict[str, Any]] = []
    uptime_seconds: float

