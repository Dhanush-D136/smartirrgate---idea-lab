import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, Radio, Cpu, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Power, Zap } from 'lucide-react';
import { api } from '../services/api';
import { DiagnosticsData } from '../types';

export const DiagnosticsPage: React.FC = () => {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await api.getDiagnostics();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27342C] font-['Outfit']">System Health & Diagnostics</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
              (data as any)?.operating_mode === 'SIMULATION'
                ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}>
              {(data as any)?.operating_mode === 'SIMULATION' ? '🧪 SIMULATOR MODE' : '⚡ HARDWARE MODE'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#778078]">Pipeline connectivity, database status, heartbeats, and audit logs</p>
        </div>
        <button
          onClick={fetchDiagnostics}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#244B36] hover:bg-[#E7EFE4] transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Run Self-Test</span>
        </button>
      </div>

      {/* Grid of System Infrastructure Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Backend */}
        <div className="rounded-2xl glass-panel p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <Server className="w-5 h-5 text-[#244B36]" />
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              {data?.backend_status || 'ONLINE'}
            </span>
          </div>
          <span className="text-xs font-bold text-[#27342C] block">FastAPI Backend</span>
          <span className="text-[11px] text-[#778078]">Uptime: {data ? `${(data.uptime_seconds / 60).toFixed(0)} min` : '--'}</span>
        </div>

        {/* Database */}
        <div className="rounded-2xl glass-panel p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <Database className="w-5 h-5 text-[#557A52]" />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              data?.database_connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {data?.database_connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
          <span className="text-xs font-bold text-[#27342C] block">Relational Database</span>
          <span className="text-[11px] text-[#778078]">SQLite Persisted Store</span>
        </div>

        {/* MQTT Broker */}
        <div className="rounded-2xl glass-panel p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <Radio className="w-5 h-5 text-indigo-600" />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              data?.mqtt_broker_status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {data?.mqtt_broker_status || 'STANDALONE'}
            </span>
          </div>
          <span className="text-xs font-bold text-[#27342C] block">Mosquitto MQTT</span>
          <span className="text-[11px] text-[#778078]">Topic: smartirrigate/#</span>
        </div>

        {/* Controller Heartbeat / Pump State */}
        <div className="rounded-2xl glass-panel p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <Power className="w-5 h-5 text-[#244B36]" />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              (data as any)?.pump_state === 'RUNNING'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              {(data as any)?.pump_state || 'OFF'}
            </span>
          </div>
          <span className="text-xs font-bold text-[#27342C] block">Authoritative Pump State</span>
          <span className="text-[11px] text-[#778078]">
            {data?.last_telemetry_time ? `Last tick: ${new Date(data.last_telemetry_time).toLocaleTimeString()}` : 'Awaiting telemetry'}
          </span>
        </div>

      </div>

      {/* Diagnostics Logs & Errors */}
      <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
        <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Active Health Checks & Diagnostic Log</h2>
        
        {data?.recent_errors && data.recent_errors.length > 0 ? (
          <div className="space-y-2">
            {data.recent_errors.map((err, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All system components, safety interlocks, and state pipelines operating nominally.</span>
          </div>
        )}
      </div>

    </div>
  );
};
