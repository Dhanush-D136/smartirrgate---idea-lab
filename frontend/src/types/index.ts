export type SystemMode = 'SIMULATION' | 'HARDWARE';
export type PumpState = 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN';
export type PermissionMode = 'AUTHORIZED_AUTO' | 'ASK_BEFORE_ACTION' | 'MANUAL_CONTROL';

export interface User {
  id: number;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SensorReading {
  id: number;
  device_id: string;
  timestamp: string;
  sequence?: number;
  soil_moisture_raw?: number;
  soil_moisture_percent?: number;
  temperature_c?: number;
  humidity_percent?: number;
  light_raw?: number;
  light_percent?: number;
  rain_detected: boolean;
  pump_state: 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN' | 'ON';
  is_simulated: boolean;
  created_at: string;
}

export interface IrrigationSetting {
  device_id: string;
  auto_mode_enabled: boolean;
  dry_threshold_percent: number;
  target_moisture_percent: number;
  max_runtime_seconds: number;
  cooldown_minutes: number;
  rain_pause_enabled: boolean;
  daylight_only: boolean;
  restricted_hours_start?: string;
  restricted_hours_end?: string;
  updated_by?: string;
  updated_at: string;
}

export interface IrrigationEvent {
  id: number;
  device_id: string;
  trigger_type: string;
  action: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  water_volume_liters?: number;
  start_soil_moisture?: number;
  end_soil_moisture?: number;
  start_moisture_percent?: number;
  end_moisture_percent?: number;
  reason?: string;
  triggered_by: string;
  created_at: string;
}

export interface SystemAlert {
  id: number;
  device_id?: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  category: string;
  title: string;
  message: string;
  source_mode: 'SIMULATION' | 'HARDWARE';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  action_recommended?: string;
  is_read: boolean;
  created_at: string;
  resolved_at?: string;
}

export interface ProposedAction {
  id: number;
  action: string;
  reason: string;
  soil_moisture_percent?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

export interface SimulationStatus {
  status?: 'RUNNING' | 'PAUSED' | 'STOPPED';
  is_running: boolean;
  is_paused: boolean;
  speed: number;
  soil_moisture_percent: number;
  current_moisture?: number;
  dry_threshold?: number;
  target_moisture?: number;
  temperature_c: number;
  humidity_percent: number;
  light_raw: number;
  rain_detected: boolean;
  rain_active?: boolean;
  sensor_fault: boolean;
  pump_state: 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN';
  pump_started_at?: string | null;
  session_runtime: number;
  last_decision_reason: string;
  last_decision_action: string;
  last_tick_time: string;
}

export interface DashboardData {
  system_status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  esp32_status: 'ONLINE' | 'OFFLINE' | 'STALE' | 'FAULT';
  rpi_status: 'ONLINE' | 'OFFLINE' | 'STALE' | 'FAULT';
  system_mode: 'SIMULATION' | 'HARDWARE';
  operating_mode: 'AUTO' | 'MANUAL';
  permission_mode: 'AUTHORIZED_AUTO' | 'ASK_BEFORE_ACTION' | 'MANUAL_CONTROL';
  pump_state: 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN';
  latest_reading?: SensorReading | null;
  settings?: IrrigationSetting | null;
  latest_event?: IrrigationEvent | null;
  is_stale: boolean;
  stale_warning?: string | null;
  active_alerts_count: number;
  simulation_status?: SimulationStatus | null;
  pending_action?: ProposedAction | null;
  server_time: string;
}

export interface DeviceInfo {
  id: string;
  device_id: string;
  name: string;
  type: string;
  hardware: string;
  status: 'ONLINE' | 'OFFLINE' | 'STALE' | 'FAULT';
  firmware_version?: string;
  ip_address?: string;
  last_seen?: string;
  is_simulated?: boolean;
  description: string;
  last_reading?: string;
  raw_value?: number;
  pump_state?: string;
  metrics?: Record<string, string>;
}

export interface IrrigationStatus {
  device_id: string;
  system_mode: 'SIMULATION' | 'HARDWARE';
  permission_mode: 'AUTHORIZED_AUTO' | 'ASK_BEFORE_ACTION' | 'MANUAL_CONTROL';
  auto_mode_enabled: boolean;
  current_pump_state: 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN';
  pump_started_at?: string | null;
  runtime_elapsed_secs: number;
  runtime_remaining_secs: number;
  cooldown_remaining_secs: number;
  max_runtime_limit_secs: number;
  last_command?: {
    command_id?: string;
    action?: string;
    status?: string;
    issued_at?: string;
    confirmed_pump_state?: string;
  } | null;
}

export interface DiagnosticsData {
  backend_status: string;
  database_connected: boolean;
  mqtt_broker_status: string;
  operating_mode: string;
  pump_state: string;
  last_esp32_heartbeat?: string | null;
  last_rpi_heartbeat?: string | null;
  last_telemetry_time?: string | null;
  last_command_time?: string | null;
  last_command_ack_status?: string | null;
  recent_errors: string[];
  active_alerts: any[];
  uptime_seconds: number;
}

export interface HardwareSettings {
  esp32_device_id?: string;
  rpi_device_id?: string;
  mqtt_broker?: string;
  mqtt_broker_host?: string;
  mqtt_port?: number;
  mqtt_broker_port?: number;
  mqtt_tls?: boolean;
  mqtt_use_tls?: boolean;
  mqtt_topic_prefix?: string;
  soil_sensor_type?: string;
  soil_raw_dry?: number;
  soil_raw_wet?: number;
  dht_type?: string;
  rain_active_low?: boolean;
  sampling_interval_seconds?: number;
  sensor_sampling_interval_secs?: number;
  heartbeat_interval_seconds?: number;
  heartbeat_interval_secs?: number;
  stale_timeout_seconds?: number;
  telemetry_freshness_threshold_secs?: number;
  sync_status?: string;
  last_sync_time?: string | null;
}
