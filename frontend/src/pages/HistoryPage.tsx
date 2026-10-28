import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  RefreshCw, 
  Droplets, 
  Thermometer, 
  Sun, 
  CloudRain, 
  Power,
  Inbox,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { api } from '../services/api';
import { SensorReading, IrrigationEvent, SystemMode } from '../types';

interface HistoryPageProps {
  systemMode?: SystemMode;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ systemMode = 'SIMULATION' }) => {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [events, setEvents] = useState<IrrigationEvent[]>([]);
  const [hours, setHours] = useState<number>(24);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const modeParam = systemMode.toLowerCase();
      const [historyData, eventData] = await Promise.all([
        api.getSensorHistory(hours, modeParam),
        api.getIrrigationEvents(50)
      ]);
      setReadings(historyData);
      setEvents(eventData);
    } catch (err) {
      console.error('Failed to load sensor history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [hours, systemMode]);

  // Calculate summary metrics from persisted data
  const totalReadings = readings.length;
  const avgMoisture = totalReadings > 0
    ? Math.round((readings.reduce((acc, r) => acc + (r.soil_moisture_percent ?? 0), 0) / totalReadings) * 10) / 10
    : 0;

  // Filter events within selected hours
  const now = new Date().getTime();
  const cutoffTime = now - hours * 60 * 60 * 1000;
  const filteredEvents = events.filter((e) => new Date(e.start_time).getTime() >= cutoffTime);

  const totalRuntimeSeconds = filteredEvents.reduce((acc, e) => acc + (e.duration_seconds || 0), 0);
  const lastEvent = events.length > 0 ? events[0] : null;

  // Format data for chart display
  const chartData = readings.map((r) => {
    const d = new Date(r.timestamp);
    const timeLabel = hours <= 24 
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit' })}`;

    return {
      time: timeLabel,
      timestamp: r.timestamp,
      soilMoisture: r.soil_moisture_percent,
      temperature: r.temperature_c,
      humidity: r.humidity_percent,
      light: r.light_percent,
      rain: r.rain_detected ? 100 : 0,
      pump: r.pump_state === 'ON' || r.pump_state === 'RUNNING' ? 100 : 0,
      isSimulated: r.is_simulated
    };
  });

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-6xl mx-auto">
      
      {/* Page Header with Time Filter & CSV Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27342C] font-['Outfit']">
              Sensor Analytics & History
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
              systemMode === 'SIMULATION'
                ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}>
              {systemMode === 'SIMULATION' ? '🧪 SIMULATED DATA' : '⚡ HARDWARE TELEMETRY'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#778078]">
            Persisted time-series telemetry with dry/target thresholds and irrigation event correlation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center rounded-xl bg-white border border-[#A9BBA0]/40 p-1 shadow-xs">
            {[
              { val: 6, label: '6h' },
              { val: 24, label: '24h' },
              { val: 168, label: '7d' },
              { val: 720, label: '30d' }
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => setHours(item.val)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  hours === item.val
                    ? 'bg-[#244B36] text-white shadow-xs'
                    : 'text-[#778078] hover:text-[#244B36]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchHistory}
            className="p-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-[#244B36] hover:bg-[#E7EFE4] transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* CSV Export Button */}
          <a
            href={api.getExportUrl(hours)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#244B36] hover:bg-[#1a3828] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Summary KPI Cards from Persisted Records */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        {/* Sessions Today */}
        <div className="p-4 rounded-2xl glass-panel shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#778078]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cycles ({hours}h)</span>
            <Activity className="w-4 h-4 text-[#244B36]" />
          </div>
          <p className="text-xl font-black text-[#27342C] font-['Outfit']">{filteredEvents.length}</p>
          <span className="text-[10px] text-[#778078]">Recorded watering sessions</span>
        </div>

        {/* Runtime in Period */}
        <div className="p-4 rounded-2xl glass-panel shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#778078]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Runtime</span>
            <Clock className="w-4 h-4 text-[#557A52]" />
          </div>
          <p className="text-xl font-black text-[#244B36] font-['Outfit']">
            {Math.round(totalRuntimeSeconds / 60)} <span className="text-xs font-normal text-[#778078]">min ({totalRuntimeSeconds}s)</span>
          </p>
          <span className="text-[10px] text-[#778078]">Pump active duration</span>
        </div>

        {/* Average Soil Moisture */}
        <div className="p-4 rounded-2xl glass-panel shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#778078]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg Moisture</span>
            <Droplets className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-xl font-black text-[#27342C] font-['Outfit']">{avgMoisture}%</p>
          <span className="text-[10px] text-[#778078]">Across {totalReadings} telemetry ticks</span>
        </div>

        {/* Last Irrigation Session */}
        <div className="p-4 rounded-2xl glass-panel shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[#778078]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Last Watered</span>
            <CheckCircle2 className="w-4 h-4 text-[#557A52]" />
          </div>
          <p className="text-sm font-bold text-[#27342C] truncate">
            {lastEvent ? new Date(lastEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None yet'}
          </p>
          <span className="text-[10px] text-[#778078] truncate block">
            {lastEvent ? `${lastEvent.duration_seconds || 0}s (${lastEvent.triggered_by})` : 'Awaiting first cycle'}
          </span>
        </div>

      </div>

      {readings.length === 0 && !loading ? (
        <div className="p-12 text-center rounded-3xl glass-panel border border-[#A9BBA0]/30 space-y-3">
          <Inbox className="w-12 h-12 text-[#A9BBA0] mx-auto" />
          <h2 className="text-lg font-bold text-[#27342C]">No Telemetry Recorded in Active Mode</h2>
          <p className="text-xs text-[#778078] max-w-md mx-auto">
            {systemMode === 'SIMULATION'
              ? 'The simulation engine is running. Click "Seed 24-Hour Synthetic Trend Data" in the Simulator drawer or wait for continuous time-stepped readings.'
              : 'Waiting for real ESP32 / Raspberry Pi telemetry over authenticated MQTT. Ensure physical devices are powered on and configured in Settings.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Chart 1: Soil Moisture History with Reference Thresholds */}
          <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-[#244B36]" />
                <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Soil Moisture Curve & Safety Thresholds</h2>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-[#244B36] font-semibold">
                  <span className="w-3 h-1 bg-[#244B36] rounded-full" /> Moisture (%)
                </span>
                <span className="flex items-center gap-1.5 text-[#C58A32] font-semibold">
                  <span className="w-3 h-0.5 border-t border-dashed border-[#C58A32]" /> Dry Threshold (35%)
                </span>
                <span className="flex items-center gap-1.5 text-[#557A52] font-semibold">
                  <span className="w-3 h-0.5 border-t border-dashed border-[#557A52]" /> Target (70%)
                </span>
                <span className="flex items-center gap-1.5 text-rose-500 font-semibold">
                  <span className="w-3 h-1 bg-rose-500 rounded-full" /> Pump Active
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="moistureGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#244B36" stopOpacity={0.45}/>
                      <stop offset="95%" stopColor="#244B36" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#A9BBA0" strokeOpacity={0.25} />
                  <XAxis dataKey="time" stroke="#778078" fontSize={11} tickLine={false} />
                  <YAxis stroke="#778078" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FAF8F1', borderRadius: '12px', border: '1px solid #A9BBA0' }}
                    labelStyle={{ color: '#27342C', fontWeight: 'bold' }}
                  />
                  <ReferenceLine y={35} stroke="#C58A32" strokeDasharray="4 4" label={{ value: 'Dry 35%', fill: '#C58A32', fontSize: 10, position: 'insideTopLeft' }} />
                  <ReferenceLine y={70} stroke="#557A52" strokeDasharray="4 4" label={{ value: 'Target 70%', fill: '#557A52', fontSize: 10, position: 'insideBottomLeft' }} />
                  <Area type="monotone" dataKey="soilMoisture" name="Soil Moisture (%)" stroke="#244B36" strokeWidth={2.5} fill="url(#moistureGradient)" />
                  <Line type="step" dataKey="pump" name="Pump Active" stroke="#E11D48" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Atmospheric Temperature & Humidity */}
          <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-rose-600" />
                <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Temperature (°C) & Humidity (% RH)</h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                  <span className="w-3 h-1 bg-amber-600 rounded-full" /> Temp (°C)
                </span>
                <span className="flex items-center gap-1.5 text-blue-600 font-semibold">
                  <span className="w-3 h-1 bg-blue-600 rounded-full" /> Humidity (%)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#A9BBA0" strokeOpacity={0.25} />
                  <XAxis dataKey="time" stroke="#778078" fontSize={11} tickLine={false} />
                  <YAxis stroke="#778078" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FAF8F1', borderRadius: '12px', border: '1px solid #A9BBA0' }}
                  />
                  <Line type="monotone" dataKey="temperature" name="Temp (°C)" stroke="#C58A32" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Light & Rain History */}
          <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-500" />
                <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Solar Light Intensity & Precipitation Events</h2>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                  <span className="w-3 h-1 bg-amber-500 rounded-full" /> Light (%)
                </span>
                <span className="flex items-center gap-1.5 text-blue-500 font-semibold">
                  <span className="w-3 h-1 bg-blue-500 rounded-full" /> Rain Detected
                </span>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="lightGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#A9BBA0" strokeOpacity={0.25} />
                  <XAxis dataKey="time" stroke="#778078" fontSize={11} tickLine={false} />
                  <YAxis stroke="#778078" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FAF8F1', borderRadius: '12px', border: '1px solid #A9BBA0' }}
                  />
                  <Area type="monotone" dataKey="light" name="Light Level (%)" stroke="#F59E0B" fill="url(#lightGradient)" />
                  <Line type="step" dataKey="rain" name="Rain Detected" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Persisted Irrigation History Table */}
          <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Power className="w-5 h-5 text-[#244B36]" />
                <h3 className="font-bold text-base text-[#27342C] font-['Outfit']">Persisted Irrigation Cycles</h3>
              </div>
              <span className="text-xs text-[#778078]">{filteredEvents.length} recorded events</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#A9BBA0]/30 text-[#778078] uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Start Time (UTC)</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Moisture (Start → End)</th>
                    <th className="py-2.5 px-3">Trigger Source</th>
                    <th className="py-2.5 px-3">Result / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#A9BBA0]/20">
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#778078]">
                        No irrigation cycles logged in this time window.
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((evt) => (
                      <tr key={evt.id} className="hover:bg-[#E7EFE4]/30">
                        <td className="py-3 px-3 font-mono text-[11px] text-[#27342C]">
                          {new Date(evt.start_time).toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            evt.action.includes('START') 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : evt.action.includes('EMERGENCY')
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-zinc-100 text-zinc-800'
                          }`}>
                            {evt.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#27342C] font-semibold">
                          {evt.duration_seconds ? `${evt.duration_seconds}s` : '--'}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-[#27342C]">
                          {evt.start_moisture_percent != null ? `${evt.start_moisture_percent}%` : '--'} → {evt.end_moisture_percent != null ? `${evt.end_moisture_percent}%` : '--'}
                        </td>
                        <td className="py-3 px-3 text-[#778078] text-[11px]">
                          {evt.triggered_by}
                        </td>
                        <td className="py-3 px-3 text-[#27342C]">
                          {evt.reason || evt.trigger_type}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
