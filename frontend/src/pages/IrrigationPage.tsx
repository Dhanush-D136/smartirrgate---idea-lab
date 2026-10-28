import React, { useState, useEffect } from 'react';
import { 
  Droplet, 
  Play, 
  Square, 
  AlertOctagon, 
  Sliders, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  RefreshCw, 
  CloudRain, 
  Sun,
  History,
  AlertTriangle,
  Radio,
  Lock,
  UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import { IrrigationStatus, IrrigationSetting, IrrigationEvent, PermissionMode, SystemMode, PumpState } from '../types';
import { useRealtime } from '../context/RealtimeContext';

interface IrrigationPageProps {
  onOpenPumpModal: () => void;
  systemMode?: SystemMode;
  onPumpStateChange?: (state: PumpState) => void;
}

export const IrrigationPage: React.FC<IrrigationPageProps> = ({ 
  onOpenPumpModal, 
  systemMode = 'SIMULATION',
  onPumpStateChange 
}) => {
  const [status, setStatus] = useState<IrrigationStatus | null>(null);
  const [settings, setSettings] = useState<IrrigationSetting | null>(null);
  const [events, setEvents] = useState<IrrigationEvent[]>([]);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('AUTHORIZED_AUTO');
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { lastMessage } = useRealtime();

  const loadData = async () => {
    try {
      const [statusRes, settingsRes, eventsRes, permRes] = await Promise.all([
        api.getIrrigationStatus(),
        api.getSettings(),
        api.getIrrigationEvents(20),
        api.getPermissionMode().catch(() => ({ permission_mode: 'AUTHORIZED_AUTO' as PermissionMode }))
      ]);
      setStatus(statusRes);
      if (statusRes?.current_pump_state) {
        onPumpStateChange?.(statusRes.current_pump_state as any);
      }
      setSettings(settingsRes);
      setEvents(eventsRes);
      if (permRes?.permission_mode) {
        setPermissionMode(permRes.permission_mode);
      }
    } catch (err) {
      console.error('Failed to load irrigation data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (lastMessage && (lastMessage.event === 'telemetry' || lastMessage.event === 'command_ack' || lastMessage.event === 'pump_state_change')) {
      loadData();
    }
  }, [lastMessage]);

  const handleStopIrrigation = async () => {
    setIsUpdating(true);
    setNotification(null);
    try {
      const res = await api.sendIrrigationCommand('STOP_PUMP', undefined, 'Manual operator stop from Management');
      if (res.status === 'SUCCESS' || res.status === 'SENT' || res.status === 'EXECUTED') {
        setNotification({
          type: 'success',
          message: 'Irrigation stopped successfully.'
        });
      } else {
        setNotification({
          type: 'error',
          message: 'Unable to confirm that irrigation has stopped. Check device connectivity.'
        });
      }
      await loadData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: 'Unable to confirm that irrigation has stopped. Check device connectivity.'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartIrrigation = async () => {
    setIsUpdating(true);
    setNotification(null);
    try {
      const res = await api.sendIrrigationCommand('START_PUMP', 300, 'Manual operator start from Management');
      setNotification({
        type: 'success',
        message: 'Irrigation start command dispatched to active controller.'
      });
      await loadData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to start irrigation.'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEmergencyStop = async () => {
    setIsUpdating(true);
    setNotification(null);
    try {
      await api.sendIrrigationCommand('EMERGENCY_STOP', undefined, 'Emergency safety stop from Management');
      setNotification({
        type: 'success',
        message: 'Irrigation stopped successfully (Emergency Stop executed).'
      });
      await loadData();
    } catch (err) {
      setNotification({
        type: 'error',
        message: 'Unable to confirm that irrigation has stopped. Check device connectivity.'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePermission = async (mode: PermissionMode) => {
    setIsUpdating(true);
    setNotification(null);
    try {
      await api.setPermissionMode(mode);
      setPermissionMode(mode);
      setNotification({
        type: 'success',
        message: `Automation permission set to: ${
          mode === 'AUTHORIZED_AUTO' 
            ? 'Authorized Automatic Operation' 
            : mode === 'ASK_BEFORE_ACTION' 
            ? 'Ask Before Action (Human-in-the-loop)' 
            : 'Manual Control Only'
        }`
      });
      await loadData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to update permission mode'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const pumpState = status?.current_pump_state || 'OFF';
  const isRunning = pumpState === 'RUNNING';

  const getPumpStateBadge = (st: string) => {
    switch (st) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            PUMP RUNNING
          </span>
        );
      case 'STARTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            STARTING...
          </span>
        );
      case 'STOPPING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            STOPPING...
          </span>
        );
      case 'FAULT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-200 text-rose-900 border border-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-700" />
            PUMP FAULT
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700 border border-zinc-300">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            STATE UNKNOWN
          </span>
        );
      default: // OFF
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            PUMP OFF (SAFE)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10 max-w-6xl mx-auto">
      
      {/* Page Title with Mode Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27342C] font-['Outfit']">Irrigation Management</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
              systemMode === 'SIMULATION'
                ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300'
            }`}>
              {systemMode === 'SIMULATION' ? '🧪 SIMULATED CONTROLLER' : '⚡ PHYSICAL HARDWARE'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#778078]">Authoritative zone actuator controls, safety interlocks, and automation permissions</p>
        </div>
        <button
          onClick={loadData}
          className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#244B36] hover:bg-[#E7EFE4] transition-colors shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh State</span>
        </button>
      </div>

      {/* Dynamic Feedback Notification Banner */}
      {notification && (
        <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top duration-200 ${
          notification.type === 'success' 
            ? 'bg-[#E7EFE4] border-[#557A52]/40 text-[#244B36]' 
            : 'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#557A52] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: Authoritative Pump Actuator Panel */}
      <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white border border-[#A9BBA0]/30 shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider block mb-1">
              Active Controller & Operating State
            </span>
            <div className="flex items-center gap-3">
              <span className="text-lg font-black text-[#27342C]">
                Zone 01 — Submersible Pump Relays
              </span>
              <span className="text-xs text-[#778078] font-mono bg-[#FAF8F1] px-2 py-0.5 rounded border border-[#A9BBA0]/20">
                {systemMode === 'SIMULATION' ? 'sim-driver-zone1' : 'esp32_relay_01'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider block mb-1">Authoritative State</span>
              {getPumpStateBadge(pumpState)}
            </div>
          </div>
        </div>

        {/* Command Buttons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Direct Authoritative Controls */}
          <div className="p-5 rounded-2xl bg-[#FAF8F1] border border-[#A9BBA0]/30 space-y-4">
            <h3 className="font-bold text-sm text-[#27342C]">Authoritative Manual Override</h3>
            <p className="text-xs text-[#778078]">
              Controls the active {systemMode === 'SIMULATION' ? 'software simulation engine' : 'physical ESP32/RPi relay'}. Dispatches command and awaits reported state confirmation.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              {isRunning ? (
                <button
                  onClick={handleStopIrrigation}
                  disabled={isUpdating}
                  className="flex-1 py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Square className="w-4 h-4 text-rose-400" />
                  <span>{isUpdating ? 'Stopping...' : 'Stop Irrigation'}</span>
                </button>
              ) : (
                <button
                  onClick={handleStartIrrigation}
                  disabled={isUpdating}
                  className="flex-1 py-3 px-4 rounded-2xl bg-[#244B36] hover:bg-[#1a3828] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 text-[#A9BBA0]" />
                  <span>{isUpdating ? 'Starting...' : 'Start Irrigation'}</span>
                </button>
              )}

              <button
                onClick={handleEmergencyStop}
                disabled={isUpdating}
                className="py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-[#B84B43] border border-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Emergency Cutoff</span>
              </button>
            </div>

            {/* In-Flight Command Audit Details */}
            {status?.last_command && (
              <div className="pt-3 border-t border-[#A9BBA0]/20 text-[11px] space-y-1.5 text-[#778078]">
                <div className="flex justify-between">
                  <span>Last Dispatched Command:</span>
                  <span className="font-semibold text-[#27342C]">{status.last_command.action}</span>
                </div>
                <div className="flex justify-between">
                  <span>Controller Acknowledgment:</span>
                  <span className="font-bold text-[#557A52]">{status.last_command.status}</span>
                </div>
                <div className="flex justify-between">
                  <span>Confirmed Physical State:</span>
                  <span className="font-semibold text-[#27342C]">{status.last_command.confirmed_pump_state || pumpState}</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Safety Watchdog Limits */}
          <div className="p-5 rounded-2xl bg-[#FAF8F1] border border-[#A9BBA0]/30 space-y-4">
            <h3 className="font-bold text-sm text-[#27342C]">Active Safety Interlocks</h3>

            <div className="space-y-3">
              {/* Continuous Runtime Watchdog */}
              <div className="p-3 rounded-xl bg-white border border-[#A9BBA0]/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#557A52]" />
                  <span>Max Continuous Runtime</span>
                </div>
                <span className="font-bold text-[#27342C]">
                  {status?.runtime_elapsed_secs ?? 0}s / {status?.max_runtime_limit_secs ?? 300}s limit
                </span>
              </div>

              {/* Cycle Cooldown Lock */}
              <div className="p-3 rounded-xl bg-white border border-[#A9BBA0]/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#C58A32]" />
                  <span>Cycle Cooldown Lock</span>
                </div>
                <span className="font-bold text-[#27342C]">
                  {status?.cooldown_remaining_secs && status.cooldown_remaining_secs > 0 
                    ? `${Math.ceil(status.cooldown_remaining_secs / 60)} min cooldown remaining` 
                    : 'Ready (Interlock Cleared)'}
                </span>
              </div>

              {/* Rain Sensor Policy */}
              <div className="p-3 rounded-xl bg-white border border-[#A9BBA0]/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CloudRain className="w-4 h-4 text-blue-500" />
                  <span>Rain Sensor Precaution</span>
                </div>
                <span className="font-bold text-[#27342C]">
                  {settings?.rain_pause_enabled ? 'Active (Pauses on Rain)' : 'Disabled'}
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* SECTION 2: 3-TIER PERMISSION MODEL */}
      <div className="rounded-3xl glass-panel p-6 sm:p-8 shadow-xl space-y-5">
        <div className="flex items-center gap-2.5 pb-2 border-b border-[#A9BBA0]/30">
          <ShieldCheck className="w-5 h-5 text-[#244B36]" />
          <div>
            <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Automation Permission Model</h2>
            <p className="text-xs text-[#778078]">Define the autonomous authority granted to the irrigation decision engine</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Option 1: Ask Before Action */}
          <div 
            onClick={() => handleChangePermission('ASK_BEFORE_ACTION')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
              permissionMode === 'ASK_BEFORE_ACTION'
                ? 'bg-white border-[#244B36] shadow-md ring-2 ring-[#244B36]/20'
                : 'bg-[#FAF8F1] border-[#A9BBA0]/30 hover:bg-white/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-[#E7EFE4] flex items-center justify-center text-[#244B36]">
                <UserCheck className="w-4 h-4" />
              </div>
              <input 
                type="radio" 
                checked={permissionMode === 'ASK_BEFORE_ACTION'} 
                readOnly 
                className="accent-[#244B36] cursor-pointer"
              />
            </div>
            <h4 className="font-bold text-sm text-[#27342C]">1. Ask Before Action</h4>
            <p className="text-[11px] text-[#778078] leading-relaxed">
              Analyzes moisture and environmental conditions, then generates a proposed action. User must approve or reject before watering begins.
            </p>
            <span className="inline-block text-[10px] font-semibold text-[#557A52] bg-[#E7EFE4] px-2 py-0.5 rounded">
              Human-in-the-Loop Safe
            </span>
          </div>

          {/* Option 2: Authorized Automatic Operation */}
          <div 
            onClick={() => handleChangePermission('AUTHORIZED_AUTO')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
              permissionMode === 'AUTHORIZED_AUTO'
                ? 'bg-white border-[#244B36] shadow-md ring-2 ring-[#244B36]/20'
                : 'bg-[#FAF8F1] border-[#A9BBA0]/30 hover:bg-white/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <input 
                type="radio" 
                checked={permissionMode === 'AUTHORIZED_AUTO'} 
                readOnly 
                className="accent-[#244B36] cursor-pointer"
              />
            </div>
            <h4 className="font-bold text-sm text-[#27342C]">2. Authorized Automatic</h4>
            <p className="text-[11px] text-[#778078] leading-relaxed">
              Explicit autonomous authority. Executes watering when moisture drops below threshold, stopping at target. Emergency stop remains active.
            </p>
            <span className="inline-block text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
              Fully Autonomous
            </span>
          </div>

          {/* Option 3: Manual Control */}
          <div 
            onClick={() => handleChangePermission('MANUAL_CONTROL')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
              permissionMode === 'MANUAL_CONTROL'
                ? 'bg-white border-[#244B36] shadow-md ring-2 ring-[#244B36]/20'
                : 'bg-[#FAF8F1] border-[#A9BBA0]/30 hover:bg-white/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800">
                <Lock className="w-4 h-4" />
              </div>
              <input 
                type="radio" 
                checked={permissionMode === 'MANUAL_CONTROL'} 
                readOnly 
                className="accent-[#244B36] cursor-pointer"
              />
            </div>
            <h4 className="font-bold text-sm text-[#27342C]">3. Manual Control Only</h4>
            <p className="text-[11px] text-[#778078] leading-relaxed">
              Continuous sensor monitoring and reporting only. Automatic starts are strictly disabled. The pump operates only upon direct manual command.
            </p>
            <span className="inline-block text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
              Zero Automation
            </span>
          </div>

        </div>
      </div>

      {/* SECTION 3: RECENT IRRIGATION EVENTS & AUDIT LOG */}
      <div className="rounded-3xl glass-panel p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-[#244B36]" />
            <h2 className="font-bold text-base text-[#27342C] font-['Outfit']">Irrigation Activity & Audit Trail</h2>
          </div>
          <span className="text-xs text-[#778078]">Persisted in database</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#A9BBA0]/30 text-[#778078] uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Start Time (UTC)</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Trigger Source</th>
                <th className="py-2.5 px-3">Moisture</th>
                <th className="py-2.5 px-3">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#A9BBA0]/20">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#778078]">
                    No irrigation events recorded yet.
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
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
                    <td className="py-3 px-3 text-[#778078] text-[11px]">
                      {evt.triggered_by}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[#27342C]">
                      {evt.start_moisture_percent != null ? `${evt.start_moisture_percent}%` : '--'} → {evt.end_moisture_percent != null ? `${evt.end_moisture_percent}%` : '--'}
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
  );
};
