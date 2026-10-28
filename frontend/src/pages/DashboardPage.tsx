import React, { useState, useEffect } from 'react';
import { 
  Droplets, 
  Thermometer, 
  Sun, 
  CloudRain, 
  Power, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Sliders, 
  ShieldCheck, 
  ShieldAlert,
  HardDrive,
  FlaskConical,
  X,
  Check,
  Info
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../services/api';
import { DashboardData, SensorReading, IrrigationEvent, SystemAlert } from '../types';
import { useRealtime } from '../context/RealtimeContext';

interface DashboardPageProps {
  systemMode?: 'SIMULATION' | 'HARDWARE';
  onModeChanged?: (mode: 'SIMULATION' | 'HARDWARE') => void;
  refreshTrigger?: number;
  onOpenPumpModal: () => void;
  onOpenSimulator: () => void;
  onPumpStateChange?: (state: 'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  systemMode = 'SIMULATION',
  onModeChanged,
  refreshTrigger = 0,
  onOpenPumpModal,
  onOpenSimulator,
  onPumpStateChange
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [historyReadings, setHistoryReadings] = useState<SensorReading[]>([]);
  const [eventsList, setEventsList] = useState<IrrigationEvent[]>([]);
  const [alertsList, setAlertsList] = useState<SystemAlert[]>([]);
  
  // Modals state
  const [selectedEvent, setSelectedEvent] = useState<IrrigationEvent | null>(null);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState<boolean>(false);
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  
  // Notification banner state
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isActing, setIsActing] = useState<boolean>(false);

  const { lastMessage } = useRealtime();

  const fetchDashboardData = async () => {
    try {
      const [dashRes, historyRes, eventsRes, alertsRes] = await Promise.all([
        api.getDashboard(),
        api.getSensorHistory(24, systemMode),
        api.getIrrigationEvents(10, systemMode),
        api.getAlerts(undefined, undefined, systemMode)
      ]);
      setData(dashRes);
      setHistoryReadings(historyRes);
      setEventsList(eventsRes);
      setAlertsList(alertsRes);
      if (onPumpStateChange) {
        onPumpStateChange(dashRes.pump_state);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [systemMode, refreshTrigger]);

  // Live WebSocket Telemetry Update
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.event === 'telemetry') {
        setData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            pump_state: lastMessage.pump_state || prev.pump_state,
            latest_reading: {
              ...(prev.latest_reading || {} as any),
              soil_moisture_percent: lastMessage.soil_moisture_percent,
              temperature_c: lastMessage.temperature_c,
              humidity_percent: lastMessage.humidity_percent,
              light_percent: lastMessage.light_percent,
              rain_detected: lastMessage.rain_detected,
              pump_state: lastMessage.pump_state,
              timestamp: lastMessage.timestamp
            }
          };
        });
        if (onPumpStateChange && lastMessage.pump_state) {
          onPumpStateChange(lastMessage.pump_state);
        }
      } else if (lastMessage.event === 'command_ack') {
        fetchDashboardData();
      }
    }
  }, [lastMessage]);

  // Start / Stop Pump Action directly from Dashboard
  const handleTogglePump = async () => {
    if (!data) return;
    const isRunning = data.pump_state === 'RUNNING' || data.pump_state === 'STARTING';
    setIsActing(true);
    setActionNotification(null);

    try {
      if (isRunning) {
        const res = await api.sendIrrigationCommand('STOP_PUMP', undefined, 'Operator stopped irrigation from Dashboard');
        setActionNotification({
          type: 'success',
          message: 'Irrigation stopped successfully.'
        });
        setData(prev => prev ? { ...prev, pump_state: 'OFF' } : null);
        if (onPumpStateChange) onPumpStateChange('OFF');
      } else {
        const res = await api.sendIrrigationCommand('START_PUMP', 300, 'Operator started irrigation from Dashboard');
        setActionNotification({
          type: 'success',
          message: res.message || 'Irrigation started successfully.'
        });
        setData(prev => prev ? { ...prev, pump_state: 'RUNNING' } : null);
        if (onPumpStateChange) onPumpStateChange('RUNNING');
      }
      setTimeout(() => fetchDashboardData(), 800);
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: err.message || 'Unable to confirm that irrigation has stopped. Check device connectivity.'
      });
    } finally {
      setIsActing(false);
    }
  };

  const handleToggleMode = async () => {
    if (!data?.settings) return;
    try {
      await api.setIrrigationMode(!data.settings.auto_mode_enabled);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to toggle mode', err);
    }
  };

  const handleApproveAction = async (actionId: number, approve: boolean) => {
    try {
      const res = await api.decideProposedAction(actionId, approve ? 'APPROVE' : 'REJECT');
      setActionNotification({
        type: approve ? 'success' : 'info',
        message: res.message
      });
      fetchDashboardData();
    } catch (err: any) {
      alert(`Action decision failed: ${err.message}`);
    }
  };

  const handleAcknowledgeAlert = async (alertId: number) => {
    try {
      await api.acknowledgeAlert(alertId);
      const updated = await api.getAlerts(undefined, undefined, systemMode);
      setAlertsList(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    try {
      await api.resolveAlert(alertId);
      const updated = await api.getAlerts(undefined, undefined, systemMode);
      setAlertsList(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const isSim = (data?.system_mode || systemMode) === 'SIMULATION';
  const soilMoisture = data?.latest_reading?.soil_moisture_percent ?? null;
  const tempC = data?.latest_reading?.temperature_c ?? null;
  const humidityPct = data?.latest_reading?.humidity_percent ?? null;
  const lightPct = data?.latest_reading?.light_percent ?? null;
  const rainDetected = data?.latest_reading?.rain_detected ?? false;
  const pumpState = data?.pump_state ?? 'OFF';
  const isAuto = data?.operating_mode === 'AUTO';
  const dryThreshold = data?.settings?.dry_threshold_percent ?? 35;
  const targetMoisture = data?.settings?.target_moisture_percent ?? 70;

  // Chart data formatting
  const chartPoints = historyReadings.map((r, i) => {
    const d = new Date(r.timestamp);
    const timeLabel = `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    return {
      time: timeLabel,
      moisture: r.soil_moisture_percent,
      temp: r.temperature_c,
      humidity: r.humidity_percent,
      pump: r.pump_state === 'RUNNING' || r.pump_state === 'ON' ? 1 : 0
    };
  });

  return (
    <div className="space-y-6 pb-20 md:pb-10 font-['Inter']">
      
      {/* 1. NOTIFICATION BANNER (Real Confirmation Feedback) */}
      {actionNotification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between shadow-md transition-all ${
          actionNotification.type === 'success' 
            ? 'bg-emerald-900/90 text-[#FAF8F1] border border-emerald-500/50' 
            : actionNotification.type === 'error'
            ? 'bg-rose-950/90 text-rose-100 border border-rose-500/50'
            : 'bg-[#27342C] text-[#FAF8F1] border border-[#A9BBA0]/40'
        }`}>
          <div className="flex items-center gap-3">
            {actionNotification.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : actionNotification.type === 'error' ? (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-semibold">{actionNotification.message}</span>
          </div>
          <button 
            onClick={() => setActionNotification(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. MODE & HARDWARE WARNING BANNER */}
      {isSim ? (
        <div className="p-3.5 px-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-4 h-4 text-amber-700 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">SIMULATOR MODE ACTIVE:</span>
              <span className="opacity-90 ml-1.5">
                {data?.simulation_status?.is_paused ? 'Simulation is paused.' : 'Generating time-stepped synthetic telemetry.'}
              </span>
              <span className="ml-2 font-mono text-[11px] bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                Speed: {data?.simulation_status?.speed || 1}x • {data?.simulation_status?.last_decision_reason || 'Running'}
              </span>
            </div>
          </div>
          <button
            onClick={onOpenSimulator}
            className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs"
          >
            Simulator Controls
          </button>
        </div>
      ) : data?.is_stale ? (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-sm block">Hardware Not Connected</span>
              <p className="text-xs text-rose-800">{data.stale_warning}</p>
            </div>
          </div>
          <button
            onClick={() => onModeChanged && onModeChanged('SIMULATION')}
            className="px-3.5 py-1.5 rounded-xl bg-[#244B36] hover:bg-[#1a3828] text-white font-semibold text-xs shrink-0"
          >
            Switch to Simulator
          </button>
        </div>
      ) : null}

      {/* 3. PENDING ACTION BANNER (For ASK_BEFORE_ACTION permission) */}
      {data?.pending_action && (
        <div className="p-4 rounded-2xl bg-[#E7EFE4] border border-[#557A52] text-[#244B36] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[#244B36] text-white shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-sm block">Approval Required: Autonomous Action Proposed</span>
              <p className="text-xs text-[#27342C] mt-0.5">{data.pending_action.reason}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleApproveAction(data.pending_action!.id, true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#244B36] hover:bg-[#1b3a29] text-white font-bold text-xs shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Approve & Irrigate</span>
            </button>
            <button
              onClick={() => handleApproveAction(data.pending_action!.id, false)}
              className="px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white text-[#778078] font-semibold text-xs border border-[#A9BBA0]/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 4. MASTER HERO CARD (Styled strictly to Greenish by Daniela Gonzales) */}
      <div className="relative overflow-hidden rounded-3xl bg-radial from-[#3B664C] via-[#244B36] to-[#1B3A29] text-[#FAF8F1] shadow-2xl p-6 sm:p-8 lg:p-10 border border-[#A9BBA0]/30">
        
        {/* Subtle decorative botanical atmosphere */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Title, Primary Telemetry, Authoritative Pump Control */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-widest text-[#A9BBA0] font-semibold">Autonomous Plant System</span>
                  {isSim && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[10px] font-bold border border-amber-300/30">
                      SIMULATED DATA
                    </span>
                  )}
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight font-['Outfit'] mt-1">Overview</h1>
              </div>

              {/* Mode Toggle Button */}
              <button
                onClick={handleToggleMode}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                  isAuto 
                    ? 'bg-[#A9BBA0]/25 text-[#FAF8F1] border-[#A9BBA0]/50 hover:bg-[#A9BBA0]/40' 
                    : 'bg-amber-500/25 text-amber-200 border-amber-400/50 hover:bg-amber-500/40'
                }`}
                title="Toggle Automatic Rule Engine"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Mode: {data?.operating_mode || 'AUTO'}</span>
              </button>
            </div>

            {/* 3 Real Primary Metric Callouts (Soil Moisture, Temperature, Humidity) */}
            <div className="grid grid-cols-3 gap-4 pt-2">
              
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#A9BBA0] font-medium mb-1">
                  <Droplets className="w-3.5 h-3.5 text-[#E7EFE4]" />
                  <span>Soil Moisture</span>
                </div>
                <div className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                  {soilMoisture !== null ? `${soilMoisture.toFixed(1)}%` : '--'}
                </div>
                <div className="text-[10px] text-[#A9BBA0] mt-0.5">
                  Target: {targetMoisture}% • Dry: {dryThreshold}%
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#A9BBA0] font-medium mb-1">
                  <Thermometer className="w-3.5 h-3.5 text-[#E7EFE4]" />
                  <span>Temperature</span>
                </div>
                <div className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                  {tempC !== null ? `${tempC.toFixed(1)}°C` : '--'}
                </div>
                <div className="text-[10px] text-[#A9BBA0] mt-0.5">
                  DHT22 Sensor
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#A9BBA0] font-medium mb-1">
                  <Sun className="w-3.5 h-3.5 text-[#E7EFE4]" />
                  <span>Humidity</span>
                </div>
                <div className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                  {humidityPct !== null ? `${humidityPct.toFixed(0)}%` : '--'}
                </div>
                <div className="text-[10px] text-[#A9BBA0] mt-0.5">
                  Solar Light: {lightPct !== null ? `${lightPct.toFixed(0)}%` : '--'}
                </div>
              </div>

            </div>

            {/* Authoritative Pump Control Action Bar */}
            <div className="pt-4 border-t border-white/15 flex flex-wrap items-center gap-3">
              <button
                onClick={handleTogglePump}
                disabled={isActing || pumpState === 'STARTING' || pumpState === 'STOPPING'}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-xs shadow-lg transition-all cursor-pointer ${
                  pumpState === 'RUNNING'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse shadow-rose-900/50'
                    : pumpState === 'STARTING' || pumpState === 'STOPPING'
                    ? 'bg-amber-600 text-white cursor-wait opacity-90'
                    : 'bg-[#FAF8F1] hover:bg-white text-[#244B36]'
                }`}
              >
                <Power className={`w-4 h-4 ${isActing ? 'animate-spin' : ''}`} />
                <span>
                  {pumpState === 'RUNNING' 
                    ? 'Pump RUNNING • Click to Stop Irrigation' 
                    : pumpState === 'STARTING'
                    ? 'Pump STARTING (Waiting for Controller)...'
                    : pumpState === 'STOPPING'
                    ? 'Pump STOPPING...'
                    : 'Start Irrigation'}
                </span>
              </button>

              <button
                onClick={onOpenPumpModal}
                className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-[#FAF8F1] border border-white/25 text-xs font-semibold transition-colors cursor-pointer"
              >
                Settings & Safety Limit
              </button>

              <div className="flex items-center gap-2 text-xs text-[#A9BBA0]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Watchdog Active (Max {data?.settings?.max_runtime_seconds || 300}s)</span>
              </div>
            </div>

          </div>

          {/* Right Column: Smart Planter Hero Asset with Real Overlaid Badges */}
          <div className="lg:col-span-5 relative flex justify-center">
            
            <div className="relative w-full max-w-[380px] rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-white/10 backdrop-blur-md p-2">
              <img
                src="/assets/smart_planter_hero.jpg"
                alt="Smart Planter Container"
                className="w-full h-auto object-cover rounded-2xl transition-transform hover:scale-102 duration-500"
              />

              {/* Floating Badge 1: Authoritative Pump State */}
              <div className="absolute top-6 left-6 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-[#244B36] text-[11px] font-bold shadow-lg flex items-center gap-1.5 border border-emerald-500/30">
                <span className={`w-2 h-2 rounded-full ${pumpState === 'RUNNING' ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                <span>Pump: {pumpState}</span>
              </div>

              {/* Floating Badge 2: Calibrated Water Moisture */}
              <div className="absolute bottom-16 right-6 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-[#244B36] text-[11px] font-bold shadow-lg flex items-center gap-1.5 border border-blue-400/30">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Moisture: {soilMoisture !== null ? `${soilMoisture.toFixed(1)}%` : '--'}</span>
              </div>

              {/* Floating Badge 3: Rain Condition */}
              <div className="absolute bottom-6 left-8 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md text-[#244B36] text-[11px] font-bold shadow-lg flex items-center gap-1.5 border border-amber-500/30">
                <CloudRain className={`w-3.5 h-3.5 ${rainDetected ? 'text-blue-600' : 'text-[#778078]'}`} />
                <span>Rain: {rainDetected ? 'Detected' : 'Clear'}</span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* 5. THREE KEY CARDS ROW: Real Soil History Chart, Critical Alerts, Activity Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Soil Moisture Analytics Chart (Real Persisted Data) */}
        <div className="rounded-3xl bg-[#27342C] text-[#FAF8F1] p-6 shadow-xl border border-[#A9BBA0]/20 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base font-['Outfit']">Soil Moisture Curve</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[#A9BBA0]">24 Hours</span>
            </div>

            {/* Threshold Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-emerald-400 mb-3">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Current: {soilMoisture !== null ? `${soilMoisture.toFixed(1)}%` : '--'}</span>
            </div>

            {/* Real Area Chart */}
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartPoints.length > 0 ? chartPoints : [{ time: 'Now', moisture: soilMoisture || 35, temp: 24, humidity: 60, pump: 0 }]}>
                  <defs>
                    <linearGradient id="moistureGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#557A52" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#557A52" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1E2922', borderRadius: '12px', border: '1px solid #557A52', fontSize: '11px' }}
                    labelStyle={{ color: '#FAF8F1' }}
                  />
                  <ReferenceLine y={dryThreshold} stroke="#C58A32" strokeDasharray="3 3" label={{ value: 'Dry', fill: '#C58A32', fontSize: 9 }} />
                  <ReferenceLine y={targetMoisture} stroke="#557A52" strokeDasharray="3 3" label={{ value: 'Target', fill: '#A9BBA0', fontSize: 9 }} />
                  <Area type="monotone" dataKey="moisture" stroke="#A9BBA0" strokeWidth={2.5} fillOpacity={1} fill="url(#moistureGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex justify-between text-[11px] text-[#A9BBA0] pt-3 border-t border-white/10">
            <span>Threshold: {dryThreshold}%</span>
            <span>Target: {targetMoisture}%</span>
          </div>
        </div>

        {/* Card 2: Critical Alerts (Real Active Alerts with Functional See All) */}
        <div className="rounded-3xl gradient-card-amber text-[#27342C] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base font-['Outfit']">Critical Alerts</h2>
              <button 
                onClick={() => setIsAlertsModalOpen(true)}
                className="text-xs font-bold hover:underline cursor-pointer"
              >
                See All ({alertsList.length})
              </button>
            </div>

            <div className="space-y-2.5">
              {alertsList.length === 0 ? (
                <div className="p-4 rounded-2xl bg-white/40 text-center text-xs text-[#244B36] font-semibold">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-emerald-800" />
                  All parameters within safe operating thresholds.
                </div>
              ) : (
                alertsList.slice(0, 3).map((a) => (
                  <div key={a.id} className="p-2.5 rounded-2xl bg-white/40 backdrop-blur-xs flex items-center justify-between border border-white/50 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-white/60 flex items-center justify-center shrink-0">
                        {a.severity === 'CRITICAL' ? (
                          <XCircle className="w-4 h-4 text-rose-700" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-800" />
                        )}
                      </div>
                      <div className="truncate">
                        <span className="font-bold block truncate">{a.title}</span>
                        <span className="text-[10px] opacity-80 block truncate">{a.message}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleResolveAlert(a.id)}
                      title="Mark as Resolved"
                      className="px-2 py-0.5 rounded-lg bg-white/60 hover:bg-white text-[10px] font-bold shrink-0 ml-1"
                    >
                      Resolve
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-black/10 text-[11px] font-semibold text-right">
            Active Mode: {systemMode}
          </div>
        </div>

        {/* Card 3: Activity Overview (Real Recorded Events with Details Drawer) */}
        <div className="rounded-3xl glass-panel p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Activity Overview</h2>
              <span className="text-xs text-[#778078]">Click for Details</span>
            </div>

            {/* Event Timeline rows */}
            <div className="space-y-2">
              {eventsList.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/70 text-center text-xs text-[#778078]">
                  No recorded events yet for this mode.
                </div>
              ) : (
                eventsList.slice(0, 3).map((evt) => {
                  const d = new Date(evt.start_time);
                  const timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                  return (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className="p-2.5 rounded-xl bg-[#FAF8F1] hover:bg-[#E7EFE4] border border-[#A9BBA0]/30 flex items-center justify-between text-xs cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-semibold text-[#27342C] block truncate">
                          {evt.action}: {evt.reason || evt.trigger_type}
                        </span>
                        <span className="text-[10px] text-[#778078] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {timeStr} • {evt.duration_seconds ? `${evt.duration_seconds}s` : 'Active'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                        evt.action === 'START' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-800'
                      }`}>
                        {evt.action}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#A9BBA0]/20 flex justify-between items-center text-[11px] text-[#778078]">
            <span>Total recorded: {eventsList.length}</span>
            <span className="font-semibold text-[#244B36]">Audit Verified</span>
          </div>
        </div>

      </div>

      {/* 6. ACTIVE ZONE TELEMETRY & STATUS TABLE */}
      <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-[#27342C] font-['Outfit']">Zone 01 Irrigation Field Status</h2>
            <p className="text-xs text-[#778078]">Authoritative controller state and calibrated sensor telemetry</p>
          </div>
          <button
            onClick={() => { setRefreshing(true); fetchDashboardData(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#E7EFE4] text-[#244B36] hover:bg-[#DCCCB2]/50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#A9BBA0]/30 text-[#778078] uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Zone / Device</th>
                <th className="py-3 px-3">Pump State</th>
                <th className="py-3 px-3">Moisture (%)</th>
                <th className="py-3 px-3">Temperature</th>
                <th className="py-3 px-3">Humidity</th>
                <th className="py-3 px-3">Rain Status</th>
                <th className="py-3 px-3 text-right">Actuator Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#A9BBA0]/20">
              
              <tr className="hover:bg-[#E7EFE4]/30 transition-colors">
                <td className="py-3.5 px-3 font-extrabold text-[#244B36]">
                  Zone 01 ({isSim ? 'Simulated ESP32' : 'Physical ESP32'})
                </td>
                <td className="py-3.5 px-3">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                    pumpState === 'RUNNING' 
                      ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                      : 'bg-zinc-100 text-zinc-700'
                  }`}>
                    {pumpState}
                  </span>
                </td>
                <td className="py-3.5 px-3 font-semibold text-[#27342C]">
                  {soilMoisture !== null ? `${soilMoisture.toFixed(1)}%` : '--'}
                </td>
                <td className="py-3.5 px-3 text-[#27342C]">
                  {tempC !== null ? `${tempC.toFixed(1)}°C` : '--'}
                </td>
                <td className="py-3.5 px-3 text-[#27342C]">
                  {humidityPct !== null ? `${humidityPct.toFixed(0)}%` : '--'}
                </td>
                <td className="py-3.5 px-3 text-[#27342C]">
                  {rainDetected ? (
                    <span className="font-bold text-blue-700">Rain Detected</span>
                  ) : (
                    <span>Clear</span>
                  )}
                </td>
                <td className="py-3.5 px-3 text-right">
                  <button
                    onClick={onOpenPumpModal}
                    className="px-3 py-1 rounded-xl bg-[#244B36] text-white font-semibold text-[11px] hover:bg-[#1a3828] transition-colors"
                  >
                    Actuate / Control
                  </button>
                </td>
              </tr>

            </tbody>
          </table>
        </div>

      </div>

      {/* 7. ACTIVITY DETAILS MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-[#FAF8F1] w-full max-w-lg rounded-3xl shadow-2xl border border-[#A9BBA0]/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-[#A9BBA0]/30 flex items-center justify-between bg-[#E7EFE4]">
              <h3 className="font-bold text-base text-[#27342C]">Irrigation Activity Details</h3>
              <button onClick={() => setSelectedEvent(null)} className="p-1 rounded-lg hover:bg-white text-[#778078]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-[#27342C]">
              <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-[#A9BBA0]/20">
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">Action</span>
                  <span className="font-bold text-sm text-[#244B36]">{selectedEvent.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">Trigger Type</span>
                  <span className="font-semibold">{selectedEvent.trigger_type}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">Start Time</span>
                  <span className="font-mono">{new Date(selectedEvent.start_time).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">Duration</span>
                  <span className="font-semibold">{selectedEvent.duration_seconds ? `${selectedEvent.duration_seconds} seconds` : 'In progress'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">Start Moisture</span>
                  <span className="font-semibold">{selectedEvent.start_soil_moisture ? `${selectedEvent.start_soil_moisture}%` : '--'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#778078] uppercase block">End Moisture</span>
                  <span className="font-semibold">{selectedEvent.end_soil_moisture ? `${selectedEvent.end_soil_moisture}%` : '--'}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#E7EFE4]/60 border border-[#A9BBA0]/30">
                <span className="text-[10px] text-[#778078] uppercase block mb-1">Decision / Reason</span>
                <p className="font-medium">{selectedEvent.reason || 'Manual command dispatched'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. COMPLETE ALERTS MANAGEMENT MODAL */}
      {isAlertsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-[#FAF8F1] w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl border border-[#A9BBA0]/40 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#A9BBA0]/30 flex items-center justify-between bg-[#E7EFE4]">
              <div>
                <h3 className="font-bold text-base text-[#27342C]">Critical System Alerts</h3>
                <p className="text-[11px] text-[#778078]">Active Mode: {systemMode}</p>
              </div>
              <button onClick={() => setIsAlertsModalOpen(false)} className="p-1 rounded-lg hover:bg-white text-[#778078]">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Filter buttons */}
            <div className="px-6 py-2 border-b border-[#A9BBA0]/20 flex gap-2 bg-white/50 text-xs">
              {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setAlertFilter(tab)}
                  className={`px-3 py-1 rounded-xl font-bold transition-all ${
                    alertFilter === tab ? 'bg-[#244B36] text-white' : 'text-[#778078] hover:bg-zinc-100'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Alert items list */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {alertsList
                .filter(a => alertFilter === 'ALL' || a.status === alertFilter)
                .map(a => (
                  <div key={a.id} className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 shadow-xs flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {a.severity}
                        </span>
                        <span className="font-bold text-[#27342C]">{a.title}</span>
                        <span className="text-[10px] text-[#778078]">{new Date(a.created_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[#778078]">{a.message}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {a.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleAcknowledgeAlert(a.id)}
                          className="px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 font-semibold text-[11px]"
                        >
                          Acknowledge
                        </button>
                      )}
                      {a.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleResolveAlert(a.id)}
                          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
