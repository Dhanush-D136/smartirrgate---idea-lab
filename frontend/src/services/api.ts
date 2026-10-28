import type {
  AuthResponse,
  DashboardData,
  DeviceInfo,
  IrrigationStatus,
  IrrigationSetting,
  IrrigationEvent,
  SensorReading,
  DiagnosticsData,
  HardwareSettings,
  SystemAlert,
  SimulationStatus,
  User
} from '../types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('smartirrigate_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) errorMsg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch (_) {}
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Authentication
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return handleResponse<AuthResponse>(res);
  },

  async register(email: string, password: string, full_name?: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name })
    });
    return handleResponse<User>(res);
  },

  async getCurrentUser(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() }
    });
    return handleResponse<User>(res);
  },

  // Dashboard Overview
  async getDashboard(): Promise<DashboardData> {
    const res = await fetch(`${API_BASE}/dashboard`);
    return handleResponse<DashboardData>(res);
  },

  // Operating Mode & Permissions
  async getSystemMode(): Promise<{ status: string; system_mode: 'SIMULATION' | 'HARDWARE'; permission_mode: string; pump_state: string }> {
    const res = await fetch(`${API_BASE}/settings/mode`);
    return handleResponse(res);
  },

  async setSystemMode(mode: 'SIMULATION' | 'HARDWARE'): Promise<{ status: string; mode: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ mode })
    });
    return handleResponse(res);
  },

  async getPermissionMode(): Promise<{ status: string; permission_mode: 'AUTHORIZED_AUTO' | 'ASK_BEFORE_ACTION' | 'MANUAL_CONTROL' }> {
    const res = await fetch(`${API_BASE}/irrigation/permission`);
    return handleResponse(res);
  },

  async setPermissionMode(permission_mode: 'AUTHORIZED_AUTO' | 'ASK_BEFORE_ACTION' | 'MANUAL_CONTROL'): Promise<{ status: string; permission_mode: string; message: string }> {
    const res = await fetch(`${API_BASE}/irrigation/permission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ permission_mode })
    });
    return handleResponse(res);
  },

  async decideProposedAction(action_id: number, decision: 'APPROVE' | 'REJECT'): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/irrigation/approve-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ action_id, decision })
    });
    return handleResponse(res);
  },

  // Devices
  async getDevices(): Promise<{ devices: DeviceInfo[]; count: number; timestamp: string }> {
    const res = await fetch(`${API_BASE}/devices`);
    return handleResponse<{ devices: DeviceInfo[]; count: number; timestamp: string }>(res);
  },

  // Sensors & History Telemetry
  async getLatestSensor(mode?: string): Promise<SensorReading | null> {
    const url = mode ? `${API_BASE}/sensors/latest?mode=${mode}` : `${API_BASE}/sensors/latest`;
    const res = await fetch(url);
    return handleResponse<SensorReading | null>(res);
  },

  async getSensorHistory(hours: number = 24, mode?: string): Promise<SensorReading[]> {
    const modeParam = mode ? `&mode=${mode}` : '';
    const res = await fetch(`${API_BASE}/sensors/history?hours=${hours}&limit=500${modeParam}`);
    return handleResponse<SensorReading[]>(res);
  },

  getExportUrl(hours: number = 168, mode?: string): string {
    const modeParam = mode ? `&mode=${mode}` : '';
    return `${API_BASE}/sensors/export?hours=${hours}${modeParam}`;
  },

  // Irrigation Controls & Authoritative State
  async getIrrigationStatus(): Promise<IrrigationStatus> {
    const res = await fetch(`${API_BASE}/irrigation/status`);
    return handleResponse<IrrigationStatus>(res);
  },

  async sendIrrigationCommand(
    action: 'START_PUMP' | 'STOP_PUMP' | 'EMERGENCY_STOP',
    duration_seconds?: number,
    reason?: string
  ): Promise<{ command_id: string; message: string; status: string }> {
    const res = await fetch(`${API_BASE}/irrigation/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ action, duration_seconds, reason })
    });
    return handleResponse<{ command_id: string; message: string; status: string }>(res);
  },

  async setIrrigationMode(auto_mode_enabled: boolean): Promise<{ message: string; auto_mode_enabled: boolean }> {
    const res = await fetch(`${API_BASE}/irrigation/mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ auto_mode_enabled })
    });
    return handleResponse<{ message: string; auto_mode_enabled: boolean }>(res);
  },

  async getIrrigationEvents(limit: number = 50, mode?: string): Promise<IrrigationEvent[]> {
    const modeParam = mode ? `&mode=${mode}` : '';
    const res = await fetch(`${API_BASE}/irrigation/events?limit=${limit}${modeParam}`);
    return handleResponse<IrrigationEvent[]>(res);
  },

  // Critical Alerts Management
  async getAlerts(status?: string, severity?: string, mode?: string): Promise<SystemAlert[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (severity) params.append('severity', severity);
    if (mode) params.append('mode', mode);
    const res = await fetch(`${API_BASE}/alerts?${params.toString()}`);
    return handleResponse<SystemAlert[]>(res);
  },

  async acknowledgeAlert(alert_id: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/alerts/${alert_id}/acknowledge`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async resolveAlert(alert_id: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/alerts/${alert_id}/resolve`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  // Settings
  async getSettings(): Promise<IrrigationSetting> {
    const res = await fetch(`${API_BASE}/settings`);
    return handleResponse<IrrigationSetting>(res);
  },

  async updateSettings(settings: Partial<IrrigationSetting>): Promise<IrrigationSetting> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(settings)
    });
    return handleResponse<IrrigationSetting>(res);
  },

  async getHardwareSettings(): Promise<HardwareSettings> {
    const res = await fetch(`${API_BASE}/settings/hardware`);
    return handleResponse<HardwareSettings>(res);
  },

  async updateHardwareSettings(data: Partial<HardwareSettings>): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/hardware`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async testBackendConnection(): Promise<{ status: string; latency_ms: number; database: string }> {
    const res = await fetch(`${API_BASE}/settings/test-backend`, { method: 'POST' });
    return handleResponse(res);
  },

  async testBackend(): Promise<{ status: string; latency_ms: number; database: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/test-backend`, { method: 'POST' });
    return handleResponse(res);
  },

  async testMqttConnection(): Promise<{ status: string; broker: string; message: string; connected: boolean }> {
    const res = await fetch(`${API_BASE}/settings/test-mqtt`, { method: 'POST' });
    return handleResponse(res);
  },

  async testMqtt(): Promise<{ status: string; broker: string; message: string; connected: boolean }> {
    const res = await fetch(`${API_BASE}/settings/test-mqtt`, { method: 'POST' });
    return handleResponse(res);
  },

  async checkDeviceStatus(): Promise<{ esp32_status: string; rpi_status: string; checked_at: string; status: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/check-device-status`, { method: 'POST' });
    return handleResponse(res);
  },

  async requestFreshTelemetry(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/request-telemetry`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async requestTelemetry(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/settings/request-telemetry`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async synchronizeConfiguration(): Promise<{ status: string; message: string; sync_time?: string; sync_status?: string; edge_target?: string; synced_at?: string }> {
    const res = await fetch(`${API_BASE}/settings/sync-config`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  async syncConfig(): Promise<{ status: string; message: string; sync_time?: string; sync_status?: string; edge_target?: string; synced_at?: string }> {
    const res = await fetch(`${API_BASE}/settings/sync-config`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return handleResponse(res);
  },

  // Diagnostics
  async getDiagnostics(): Promise<DiagnosticsData> {
    const res = await fetch(`${API_BASE}/system/diagnostics`);
    return handleResponse<DiagnosticsData>(res);
  },

  // Simulation Engine Controls
  async getSimulationStatus(): Promise<SimulationStatus> {
    const res = await fetch(`${API_BASE}/simulation/status`);
    const data = await handleResponse<any>(res);
    const sim = data.simulation || {};
    return {
      ...sim,
      status: sim.is_running ? (sim.is_paused ? 'PAUSED' : 'RUNNING') : 'STOPPED',
      current_moisture: sim.soil_moisture_percent,
      dry_threshold: 35.0,
      target_moisture: 70.0,
      rain_active: sim.rain_detected
    };
  },

  // Simulation Engine Controls
  async controlSimulation(action: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'RESET', initial_moisture?: number): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/simulation/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, initial_moisture })
    });
    return handleResponse(res);
  },

  async setSimulationSpeed(speed: number): Promise<{ status: string; speed: number }> {
    const res = await fetch(`${API_BASE}/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed })
    });
    return handleResponse(res);
  },

  async setSimulationMoisture(soil_moisture_percent: number): Promise<{ status: string; soil_moisture_percent: number }> {
    const res = await fetch(`${API_BASE}/simulation/moisture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soil_moisture_percent })
    });
    return handleResponse(res);
  },

  async toggleSimulationRain(): Promise<{ status: string; rain_detected: boolean }> {
    const res = await fetch(`${API_BASE}/simulation/toggle-rain`, { method: 'POST' });
    return handleResponse(res);
  },

  async toggleSimulationFault(): Promise<{ status: string; sensor_fault: boolean }> {
    const res = await fetch(`${API_BASE}/simulation/toggle-fault`, { method: 'POST' });
    return handleResponse(res);
  },

  async seedDemoHistory(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/simulation/seed-demo-history`, {
      method: 'POST'
    });
    return handleResponse<{ status: string; message: string }>(res);
  }
};
