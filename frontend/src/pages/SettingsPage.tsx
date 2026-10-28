import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Shield, 
  Sliders, 
  CloudRain, 
  Sun,
  Cpu,
  Server,
  Radio,
  RefreshCw,
  Zap,
  Activity,
  Layers,
  Check,
  AlertOctagon,
  Eye,
  Lock
} from 'lucide-react';
import { api } from '../services/api';
import { IrrigationSetting, HardwareSettings } from '../types';

interface SettingsPageProps {
  systemMode?: 'SIMULATION' | 'HARDWARE';
  onModeChanged?: (mode: 'SIMULATION' | 'HARDWARE') => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ systemMode = 'SIMULATION', onModeChanged }) => {
  const [activeTab, setActiveTab] = useState<'THRESHOLDS' | 'HARDWARE'>('THRESHOLDS');
  const [settings, setSettings] = useState<IrrigationSetting | null>(null);
  const [hardware, setHardware] = useState<HardwareSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Diagnostic Action States
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ action: string; success: boolean; message: string; details?: any } | null>(null);

  // Form State: General Thresholds
  const [dryThreshold, setDryThreshold] = useState<number>(35.0);
  const [targetMoisture, setTargetMoisture] = useState<number>(70.0);
  const [maxRuntimeSecs, setMaxRuntimeSecs] = useState<number>(300);
  const [cooldownMins, setCooldownMins] = useState<number>(30);
  const [rainPause, setRainPause] = useState<boolean>(true);
  const [daylightOnly, setDaylightOnly] = useState<boolean>(false);

  // Form State: Hardware & Sensors
  const [esp32Id, setEsp32Id] = useState<string>('esp32_irrigation_controller');
  const [rpiId, setRpiId] = useState<string>('rpi_edge_gateway_01');
  const [mqttBroker, setMqttBroker] = useState<string>('127.0.0.1');
  const [mqttPort, setMqttPort] = useState<number>(1883);
  const [mqttTls, setMqttTls] = useState<boolean>(false);
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState<string>('smartirrigate');
  const [heartbeatInterval, setHeartbeatInterval] = useState<number>(30);
  const [freshnessThreshold, setFreshnessThreshold] = useState<number>(60);
  const [samplingInterval, setSamplingInterval] = useState<number>(10);
  const [soilSensorType, setSoilSensorType] = useState<string>('Capacitive Soil Moisture v1.2');
  const [soilRawDry, setSoilRawDry] = useState<number>(3200);
  const [soilRawWet, setSoilRawWet] = useState<number>(1400);
  const [dhtType, setDhtType] = useState<string>('DHT22');
  const [testRawAdc, setTestRawAdc] = useState<number>(2300);

  useEffect(() => {
    async function fetchData() {
      try {
        const [setData, hwData] = await Promise.all([
          api.getSettings(),
          api.getHardwareSettings().catch(() => null)
        ]);
        
        setSettings(setData);
        setDryThreshold(setData.dry_threshold_percent);
        setTargetMoisture(setData.target_moisture_percent);
        setMaxRuntimeSecs(setData.max_runtime_seconds);
        setCooldownMins(setData.cooldown_minutes);
        setRainPause(setData.rain_pause_enabled);
        setDaylightOnly(setData.daylight_only);

        if (hwData) {
          setHardware(hwData);
          setEsp32Id(hwData.esp32_device_id || 'esp32_irrigation_controller');
          setRpiId(hwData.rpi_device_id || 'rpi_edge_gateway_01');
          setMqttBroker(hwData.mqtt_broker || '127.0.0.1');
          setMqttPort(hwData.mqtt_port || 1883);
          setMqttTls(hwData.mqtt_tls || false);
          setMqttTopicPrefix(hwData.mqtt_topic_prefix || 'smartirrigate');
          setHeartbeatInterval(hwData.heartbeat_interval_secs || 30);
          setFreshnessThreshold(hwData.telemetry_freshness_threshold_secs || 60);
          setSamplingInterval(hwData.sensor_sampling_interval_secs || 10);
          setSoilSensorType(hwData.soil_sensor_type || 'Capacitive Soil Moisture v1.2');
          setSoilRawDry(hwData.soil_raw_dry || 3200);
          setSoilRawWet(hwData.soil_raw_wet || 1400);
          setDhtType(hwData.dht_type || 'DHT22');
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const calculateCalibratedMoisture = (raw: number) => {
    if (soilRawDry <= soilRawWet) return 0;
    const pct = ((soilRawDry - raw) / (soilRawDry - soilRawWet)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
  };

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (dryThreshold >= targetMoisture) {
      setErrorMsg('Target moisture threshold must be strictly higher than dry threshold for safe hysteresis');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateSettings({
        dry_threshold_percent: dryThreshold,
        target_moisture_percent: targetMoisture,
        max_runtime_seconds: maxRuntimeSecs,
        cooldown_minutes: cooldownMins,
        rain_pause_enabled: rainPause,
        daylight_only: daylightOnly
      });
      setSettings(updated);
      setSuccessMsg('Irrigation safety parameters validated and updated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHardware = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (soilRawDry <= soilRawWet) {
      setErrorMsg('Raw Dry ADC reading must be strictly greater than Raw Wet ADC reading for capacitive sensors');
      return;
    }

    setSaving(true);
    try {
      const payload: HardwareSettings = {
        esp32_device_id: esp32Id,
        rpi_device_id: rpiId,
        mqtt_broker: mqttBroker,
        mqtt_port: mqttPort,
        mqtt_tls: mqttTls,
        mqtt_topic_prefix: mqttTopicPrefix,
        heartbeat_interval_secs: heartbeatInterval,
        telemetry_freshness_threshold_secs: freshnessThreshold,
        sensor_sampling_interval_secs: samplingInterval,
        soil_sensor_type: soilSensorType,
        soil_raw_dry: soilRawDry,
        soil_raw_wet: soilRawWet,
        dht_type: dhtType
      };

      const res = await api.updateHardwareSettings(payload);
      setHardware((res as any).settings || payload);
      setSuccessMsg('Hardware device and calibration settings saved to database successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update hardware settings');
    } finally {
      setSaving(false);
    }
  };

  // Maintenance Operations
  const runDiagnosticAction = async (action: 'TEST_BACKEND' | 'TEST_MQTT' | 'CHECK_STATUS' | 'REQUEST_TELEMETRY' | 'SYNC_CONFIG') => {
    setActionInProgress(action);
    setActionFeedback(null);
    try {
      let res: any;
      if (action === 'TEST_BACKEND') {
        res = await api.testBackend();
        setActionFeedback({ action: 'Backend Verification', success: res.status === 'OK', message: res.message, details: res });
      } else if (action === 'TEST_MQTT') {
        res = await api.testMqtt();
        setActionFeedback({ action: 'MQTT Broker Test', success: res.connected, message: res.message, details: res });
      } else if (action === 'CHECK_STATUS') {
        res = await api.checkDeviceStatus();
        setActionFeedback({ action: 'Device Connectivity', success: res.status !== 'OFFLINE', message: `Status: ${res.status}. ${res.message}`, details: res });
      } else if (action === 'REQUEST_TELEMETRY') {
        res = await api.requestTelemetry();
        setActionFeedback({ action: 'Telemetry Polling', success: res.status === 'QUEUED' || res.status === 'SUCCESS', message: res.message });
      } else if (action === 'SYNC_CONFIG') {
        res = await api.syncConfig();
        setActionFeedback({ 
          action: 'Configuration Synchronization', 
          success: res.sync_status === 'SYNCHRONIZED', 
          message: res.message, 
          details: { synced_at: res.synced_at, target: res.edge_target } 
        });
      }
    } catch (err: any) {
      setActionFeedback({
        action,
        success: false,
        message: err.message || 'Action failed or device unreachable'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27342C] font-['Outfit']">System & Hardware Configuration</h1>
          <p className="text-xs sm:text-sm text-[#778078]">Actuator thresholds, sensor ADC calibration, MQTT credentials, and device synchronization</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-2xl bg-white border border-[#A9BBA0]/40 p-1 shadow-xs">
          <button
            onClick={() => { setActiveTab('THRESHOLDS'); setActionFeedback(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'THRESHOLDS'
                ? 'bg-[#244B36] text-white shadow-xs'
                : 'text-[#778078] hover:text-[#244B36]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Safety Thresholds</span>
          </button>
          <button
            onClick={() => { setActiveTab('HARDWARE'); setActionFeedback(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'HARDWARE'
                ? 'bg-[#244B36] text-white shadow-xs'
                : 'text-[#778078] hover:text-[#244B36]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Hardware Devices & Sensors</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-[#E7EFE4] border border-[#557A52]/40 text-[#244B36] text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#557A52] shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs font-bold opacity-60">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-[#B84B43] text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-[#B84B43] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-xs font-bold opacity-60">✕</button>
        </div>
      )}

      {/* Diagnostic Action Result Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-2xl border text-xs font-semibold shadow-xs animate-in fade-in ${
          actionFeedback.success 
            ? 'bg-[#E7EFE4] border-[#557A52]/40 text-[#244B36]' 
            : 'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {actionFeedback.success ? <Check className="w-4 h-4 text-[#557A52]" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
              <span className="font-bold">{actionFeedback.action}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-xs font-bold opacity-60">✕</button>
          </div>
          <p className="text-[11px] font-normal pl-6">{actionFeedback.message}</p>
          {actionFeedback.details && (
            <pre className="mt-2 ml-6 p-2 rounded-lg bg-black/5 text-[10px] font-mono overflow-x-auto">
              {JSON.stringify(actionFeedback.details, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* TAB 1: SAFETY THRESHOLDS */}
      {activeTab === 'THRESHOLDS' && (
        <form onSubmit={handleSaveThresholds} className="space-y-6">
          
          {/* Moisture & Hysteresis */}
          <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#A9BBA0]/30">
              <Sliders className="w-5 h-5 text-[#244B36]" />
              <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Moisture Thresholds & Hysteresis Band</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#27342C] mb-1">
                  Dry Threshold: <span className="font-bold text-[#C58A32]">{dryThreshold}%</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  value={dryThreshold}
                  onChange={(e) => setDryThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#244B36] cursor-pointer"
                />
                <p className="text-[11px] text-[#778078] mt-1">Automatic watering triggers when soil drops below this value.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#27342C] mb-1">
                  Target Moisture: <span className="font-bold text-[#557A52]">{targetMoisture}%</span>
                </label>
                <input
                  type="range"
                  min="40"
                  max="95"
                  step="1"
                  value={targetMoisture}
                  onChange={(e) => setTargetMoisture(parseFloat(e.target.value))}
                  className="w-full accent-[#557A52] cursor-pointer"
                />
                <p className="text-[11px] text-[#778078] mt-1">Irrigation automatically stops once moisture reaches this level.</p>
              </div>
            </div>
          </div>

          {/* Pump Hardware Watchdog */}
          <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#A9BBA0]/30">
              <Shield className="w-5 h-5 text-[#244B36]" />
              <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Hardware Watchdog & Runtime Interlocks</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#27342C] mb-1">
                  Max Continuous Runtime: <span className="font-bold">{maxRuntimeSecs} seconds ({Math.round(maxRuntimeSecs/60)} min)</span>
                </label>
                <input
                  type="number"
                  min="30"
                  max="1800"
                  step="10"
                  value={maxRuntimeSecs}
                  onChange={(e) => setMaxRuntimeSecs(parseInt(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                />
                <p className="text-[11px] text-[#778078] mt-1">Forced shutoff limit to prevent flooded roots or runaway pumps.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#27342C] mb-1">
                  Cycle Cooldown: <span className="font-bold">{cooldownMins} minutes</span>
                </label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  step="5"
                  value={cooldownMins}
                  onChange={(e) => setCooldownMins(parseInt(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                />
                <p className="text-[11px] text-[#778078] mt-1">Resting period between consecutive watering cycles to allow soil percolation.</p>
              </div>
            </div>
          </div>

          {/* Environmental Policies */}
          <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-4">
            <h2 className="font-bold text-base text-[#27342C] pb-2 border-b border-[#A9BBA0]/30 font-['Outfit']">Environmental Policies</h2>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-[#A9BBA0]/30">
              <div className="flex items-center gap-3">
                <CloudRain className="w-5 h-5 text-blue-500" />
                <div>
                  <span className="text-xs font-bold text-[#27342C] block">Rain Sensor Precautionary Pause</span>
                  <span className="text-[11px] text-[#778078]">Pause watering cycles when the FC-37 wetness plate detects precipitation</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={rainPause}
                onChange={(e) => setRainPause(e.target.checked)}
                className="w-5 h-5 accent-[#244B36] cursor-pointer rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-[#A9BBA0]/30">
              <div className="flex items-center gap-3">
                <Sun className="w-5 h-5 text-amber-500" />
                <div>
                  <span className="text-xs font-bold text-[#27342C] block">Daylight Hours Only</span>
                  <span className="text-[11px] text-[#778078]">Restricts automatic watering to daytime using LDR light telemetry</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={daylightOnly}
                onChange={(e) => setDaylightOnly(e.target.checked)}
                className="w-5 h-5 accent-[#244B36] cursor-pointer rounded"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#244B36] hover:bg-[#1a3828] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Apply & Save Thresholds'}</span>
          </button>
        </form>
      )}

      {/* TAB 2: HARDWARE DEVICES & SENSORS */}
      {activeTab === 'HARDWARE' && (
        <div className="space-y-6">
          
          {/* Warning Banner */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-3 shadow-xs">
            <AlertOctagon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold uppercase tracking-wider block text-[10px]">Electrical Safety Interlock</span>
              <p className="leading-relaxed">
                Verify pump wiring, optocoupler relay isolation, and DC power supply ratings before activating physical hardware control. Never power a submersible pump directly from ESP32 or Raspberry Pi 3.3V/5V GPIO pins.
              </p>
            </div>
          </div>

          {/* Maintenance & Connectivity Action Bar */}
          <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-[#27342C] font-['Outfit']">Connection & Device Maintenance Actions</h3>
                <p className="text-xs text-[#778078]">Perform real-time network tests and synchronize edge controllers</p>
              </div>
              {actionInProgress && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#244B36] animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running operation...
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => runDiagnosticAction('TEST_BACKEND')}
                disabled={actionInProgress !== null}
                className="p-3 rounded-2xl bg-white border border-[#A9BBA0]/40 text-xs font-bold text-[#244B36] hover:bg-[#E7EFE4] shadow-xs transition-colors flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50"
              >
                <Server className="w-4 h-4 text-[#557A52]" />
                <span>Test Backend</span>
              </button>

              <button
                type="button"
                onClick={() => runDiagnosticAction('TEST_MQTT')}
                disabled={actionInProgress !== null}
                className="p-3 rounded-2xl bg-white border border-[#A9BBA0]/40 text-xs font-bold text-[#244B36] hover:bg-[#E7EFE4] shadow-xs transition-colors flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50"
              >
                <Radio className="w-4 h-4 text-indigo-600" />
                <span>Test MQTT Broker</span>
              </button>

              <button
                type="button"
                onClick={() => runDiagnosticAction('CHECK_STATUS')}
                disabled={actionInProgress !== null}
                className="p-3 rounded-2xl bg-white border border-[#A9BBA0]/40 text-xs font-bold text-[#244B36] hover:bg-[#E7EFE4] shadow-xs transition-colors flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50"
              >
                <Cpu className="w-4 h-4 text-[#244B36]" />
                <span>Check Device Status</span>
              </button>

              <button
                type="button"
                onClick={() => runDiagnosticAction('REQUEST_TELEMETRY')}
                disabled={actionInProgress !== null}
                className="p-3 rounded-2xl bg-white border border-[#A9BBA0]/40 text-xs font-bold text-[#244B36] hover:bg-[#E7EFE4] shadow-xs transition-colors flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4 text-[#C58A32]" />
                <span>Request Telemetry</span>
              </button>

              <button
                type="button"
                onClick={() => runDiagnosticAction('SYNC_CONFIG')}
                disabled={actionInProgress !== null}
                className="p-3 rounded-2xl bg-[#244B36] hover:bg-[#1a3828] text-white text-xs font-bold shadow-xs transition-colors flex flex-col items-center gap-1.5 text-center cursor-pointer disabled:opacity-50 col-span-2 sm:col-span-1"
              >
                <Zap className="w-4 h-4 text-[#A9BBA0]" />
                <span>Synchronize Config</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveHardware} className="space-y-6">

            {/* 1. Controller & Gateway Settings */}
            <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#A9BBA0]/30">
                <Cpu className="w-5 h-5 text-[#244B36]" />
                <h3 className="font-bold text-base text-[#27342C] font-['Outfit']">Edge Controllers & Devices</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">ESP32 Device Identifier</label>
                  <input
                    type="text"
                    value={esp32Id}
                    onChange={(e) => setEsp32Id(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono text-[#27342C]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">Unique client ID used in MQTT telemetry publications</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Raspberry Pi Edge Gateway ID</label>
                  <input
                    type="text"
                    value={rpiId}
                    onChange={(e) => setRpiId(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono text-[#27342C]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">Local edge broker & decision service ID</p>
                </div>
              </div>
            </div>

            {/* 2. MQTT Broker Credentials & Timing */}
            <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#A9BBA0]/30">
                <Radio className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-[#27342C] font-['Outfit']">MQTT Broker & Message Pipeline</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Broker IP / Hostname</label>
                  <input
                    type="text"
                    value={mqttBroker}
                    onChange={(e) => setMqttBroker(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono text-[#27342C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Port</label>
                  <input
                    type="number"
                    value={mqttPort}
                    onChange={(e) => setMqttPort(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono text-[#27342C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Topic Prefix</label>
                  <input
                    type="text"
                    value={mqttTopicPrefix}
                    onChange={(e) => setMqttTopicPrefix(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono text-[#27342C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#A9BBA0]/20">
                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Heartbeat Interval</label>
                  <input
                    type="number"
                    value={heartbeatInterval}
                    onChange={(e) => setHeartbeatInterval(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">Seconds between device ping packets</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Telemetry Freshness Threshold</label>
                  <input
                    type="number"
                    value={freshnessThreshold}
                    onChange={(e) => setFreshnessThreshold(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">Seconds before marking sensor as Stale</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Sampling Interval</label>
                  <input
                    type="number"
                    value={samplingInterval}
                    onChange={(e) => setSamplingInterval(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">ADC sensor sampling frequency</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="tlsCheckbox"
                  checked={mqttTls}
                  onChange={(e) => setMqttTls(e.target.checked)}
                  className="w-4 h-4 accent-[#244B36] rounded"
                />
                <label htmlFor="tlsCheckbox" className="text-xs font-semibold text-[#27342C] cursor-pointer">
                  Enable TLS 1.3 / MQTTS Encryption (Port 8883)
                </label>
              </div>
            </div>

            {/* 3. Soil Moisture ADC Calibration with Live Preview */}
            <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#A9BBA0]/30">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-5 h-5 text-[#244B36]" />
                  <h3 className="font-bold text-base text-[#27342C] font-['Outfit']">Soil Moisture Sensor Calibration (ADC)</h3>
                </div>
                <span className="text-[11px] font-bold text-[#557A52] bg-[#E7EFE4] px-2.5 py-1 rounded-xl">
                  Capacitive Analog Transducer
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">
                    Raw Dry Air Calibration (0% Moisture)
                  </label>
                  <input
                    type="number"
                    value={soilRawDry}
                    onChange={(e) => setSoilRawDry(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono font-bold text-[#C58A32]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">ADC value when sensor probe is held dry in free air (e.g. 3200)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">
                    Raw Wet Water Calibration (100% Saturation)
                  </label>
                  <input
                    type="number"
                    value={soilRawWet}
                    onChange={(e) => setSoilRawWet(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-mono font-bold text-[#557A52]"
                  />
                  <p className="text-[10px] text-[#778078] mt-1">ADC value when sensor probe is submerged in a cup of water (e.g. 1400)</p>
                </div>
              </div>

              {/* Calibration Preview Calculator */}
              <div className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#244B36]" />
                  <span className="text-xs font-bold text-[#27342C]">Live Calibration Formula Preview</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-[11px] text-[#778078] mb-1">Test Raw ADC Input Value:</label>
                    <input
                      type="number"
                      value={testRawAdc}
                      onChange={(e) => setTestRawAdc(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-[#FAF8F1] border border-[#A9BBA0]/30 text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-[#E7EFE4] text-center">
                    <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider block">Resulting Calibrated Moisture</span>
                    <span className="text-xl font-black text-[#244B36] font-mono">
                      {calculateCalibratedMoisture(testRawAdc)}%
                    </span>
                  </div>
                </div>

                <p className="text-[10px] font-mono text-[#778078]">
                  Formula: Moisture % = max(0, min(100, ({soilRawDry} - raw_adc) / ({soilRawDry} - {soilRawWet}) × 100))
                </p>
              </div>

              {/* Atmospheric Sensor Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#A9BBA0]/20">
                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Temperature / Humidity Sensor Type</label>
                  <select
                    value={dhtType}
                    onChange={(e) => setDhtType(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#27342C]"
                  >
                    <option value="DHT22">DHT22 / AM2302 (Precision ±0.5°C, ±2% RH)</option>
                    <option value="DHT11">DHT11 (Basic ±2°C, ±5% RH)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#27342C] mb-1">Rain Sensor Active Polarity</label>
                  <input
                    type="text"
                    disabled
                    value="FC-37 (Active-Low Digital GPIO + Analog ADC)"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF8F1] border border-[#A9BBA0]/30 text-xs font-semibold text-[#778078]"
                  />
                </div>
              </div>

            </div>

            {/* Save Hardware Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3.5 rounded-2xl bg-[#244B36] hover:bg-[#1a3828] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Hardware Configuration...' : 'Save Hardware Devices & Calibration'}</span>
            </button>

          </form>
        </div>
      )}

    </div>
  );
};
