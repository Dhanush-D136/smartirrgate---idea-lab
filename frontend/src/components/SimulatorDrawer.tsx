import React, { useState, useEffect } from 'react';
import { 
  X, 
  FlaskConical, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  CheckCircle2, 
  CloudRain, 
  Sun, 
  AlertTriangle, 
  Database,
  FastForward,
  Cpu,
  Layers,
  Activity,
  Zap
} from 'lucide-react';
import { api } from '../services/api';
import { SimulationStatus } from '../types';

interface SimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTelemetryInjected: () => void;
}

export const SimulatorDrawer: React.FC<SimulatorDrawerProps> = ({
  isOpen,
  onClose,
  onTelemetryInjected
}) => {
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [moistureInput, setMoistureInput] = useState<number>(30.0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const fetchStatus = async () => {
    try {
      const data = await api.getSimulationStatus();
      setStatus(data);
      if (data.current_moisture) {
        setMoistureInput(Math.round(data.current_moisture * 10) / 10);
      }
    } catch (err) {
      console.error('Failed to get simulation status', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleControl = async (action: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'RESET') => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.controlSimulation(action);
      setFeedback(res.message);
      await fetchStatus();
      onTelemetryInjected();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setShowResetConfirm(false);
    }
  };

  const handleSpeed = async (speed: number) => {
    setIsSubmitting(true);
    try {
      await api.setSimulationSpeed(speed);
      await fetchStatus();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyMoisture = async () => {
    setIsSubmitting(true);
    try {
      await api.setSimulationMoisture(moistureInput);
      setFeedback(`Initial soil moisture set to ${moistureInput}%`);
      await fetchStatus();
      onTelemetryInjected();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRain = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.toggleSimulationRain();
      setFeedback(res.rain_detected ? 'Simulated rain activated' : 'Simulated rain cleared');
      await fetchStatus();
      onTelemetryInjected();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleFault = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.toggleSimulationFault();
      setFeedback(res.sensor_fault ? 'Simulated sensor fault triggered' : 'Simulated sensor fault resolved');
      await fetchStatus();
      onTelemetryInjected();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeedHistory = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.seedDemoHistory();
      setFeedback(res.message);
      onTelemetryInjected();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#FAF8F1] h-full shadow-2xl flex flex-col border-l border-[#A9BBA0]/40 overflow-y-auto">
        
        {/* Header */}
        <div className="p-5 border-b border-[#A9BBA0]/30 flex items-center justify-between bg-[#E7EFE4]/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#C58A32] text-white shadow-xs">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg text-[#27342C] font-['Outfit']">Simulation Engine</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  status?.status === 'RUNNING' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : status?.status === 'PAUSED'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-zinc-100 text-zinc-700 border border-zinc-300'
                }`}>
                  {status?.status || 'RUNNING'}
                </span>
              </div>
              <p className="text-xs text-[#778078]">Authoritative backend physics & automation testbed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#778078] hover:bg-white/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explicit Tag Notice */}
        <div className="m-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider block text-[10px]">Strict Mode Isolation</span>
            All readings generated here are permanently tagged <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[10px]">is_simulated = true</code>. They will never contaminate physical hardware dashboards or charts.
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className="mx-4 mb-2 p-3 rounded-xl bg-[#E7EFE4] border border-[#557A52]/40 text-[#244B36] text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#557A52] shrink-0" />
              <span>{feedback}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-xs font-bold opacity-60">✕</button>
          </div>
        )}

        <div className="p-5 space-y-5 flex-1">

          {/* ENGINE CONTROLS: Start, Pause, Resume, Stop, Reset */}
          <div className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 space-y-3">
            <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider block">
              Simulation Loop Controls
            </span>
            <div className="grid grid-cols-3 gap-2">
              {status?.status === 'RUNNING' ? (
                <button
                  onClick={() => handleControl('PAUSE')}
                  disabled={isSubmitting}
                  className="py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  onClick={() => handleControl(status?.status === 'PAUSED' ? 'RESUME' : 'START')}
                  disabled={isSubmitting}
                  className="py-2.5 px-3 rounded-xl bg-[#244B36] hover:bg-[#1a3828] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{status?.status === 'PAUSED' ? 'Resume' : 'Start'}</span>
                </button>
              )}

              <button
                onClick={() => handleControl('STOP')}
                disabled={isSubmitting || status?.status === 'STOPPED'}
                className="py-2.5 px-3 rounded-xl bg-zinc-700 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>

              <button
                onClick={() => setShowResetConfirm(true)}
                disabled={isSubmitting}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#B84B43] border border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Reset Confirmation Prompt */}
            {showResetConfirm && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-2 animate-in fade-in">
                <p className="text-xs font-semibold text-rose-900">
                  Reset simulation? This resets moisture to baseline (28%) and turns off the simulated pump.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleControl('RESET')}
                    disabled={isSubmitting}
                    className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
                  >
                    Yes, Reset Simulation
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-semibold text-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SIMULATION SPEED */}
          <div className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider">
                Time-Step Speed Multiplier
              </span>
              <span className="text-xs font-bold text-[#244B36]">{status?.speed || 1}x Realtime</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeed(s)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    (status?.speed || 1) === s
                      ? 'bg-[#244B36] text-white shadow-xs'
                      : 'bg-[#FAF8F1] border border-[#A9BBA0]/30 text-[#27342C] hover:bg-[#E7EFE4]'
                  }`}
                >
                  {s}x Speed
                </button>
              ))}
            </div>
          </div>

          {/* RULE ENGINE REASONING DISPLAY */}
          <div className="p-4 rounded-2xl bg-[#E7EFE4]/60 border border-[#A9BBA0]/40 space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#C58A32]" />
              <span className="text-xs font-bold text-[#27342C]">Rule Engine Decision</span>
            </div>
            <p className="text-xs text-[#244B36] font-medium italic bg-white p-2.5 rounded-xl border border-[#A9BBA0]/30">
              "{status?.last_decision_reason || 'Evaluating deterministic soil moisture thresholds and safety constraints.'}"
            </p>
            <div className="flex justify-between text-[11px] text-[#778078] pt-1">
              <span>Dry Threshold: <strong className="text-[#C58A32]">{status?.dry_threshold || 35}%</strong></span>
              <span>Target Moisture: <strong className="text-[#557A52]">{status?.target_moisture || 70}%</strong></span>
            </div>
          </div>

          {/* INITIAL SOIL MOISTURE SLIDER */}
          <div className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-[#27342C]">Current Moisture (Simulated)</span>
              <span className="text-sm font-extrabold text-[#244B36]">
                {status?.current_moisture ? status.current_moisture.toFixed(1) : moistureInput.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="95"
              step="1"
              value={moistureInput}
              onChange={(e) => setMoistureInput(parseFloat(e.target.value))}
              className="w-full accent-[#244B36] cursor-pointer"
            />
            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] text-[#778078]">Adjust slider to test dry/wet cycles</span>
              <button
                onClick={handleApplyMoisture}
                disabled={isSubmitting}
                className="px-3 py-1 rounded-lg bg-[#244B36] text-white text-[11px] font-bold hover:bg-[#1a3828]"
              >
                Set Value
              </button>
            </div>
          </div>

          {/* SIMULATED RAIN & FAULT TOGGLES */}
          <div className="space-y-2.5">
            {/* Rain Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-[#A9BBA0]/30">
              <div className="flex items-center gap-2.5">
                <CloudRain className={`w-5 h-5 ${status?.rain_active ? 'text-blue-500' : 'text-[#778078]'}`} />
                <div>
                  <span className="text-xs font-bold text-[#27342C] block">Simulated Rain Sensor</span>
                  <span className="text-[11px] text-[#778078]">{status?.rain_active ? 'Rain Injected' : 'Dry Surface'}</span>
                </div>
              </div>
              <button
                onClick={handleToggleRain}
                disabled={isSubmitting}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  status?.rain_active ? 'bg-blue-600 text-white' : 'bg-[#E7EFE4] text-[#244B36]'
                }`}
              >
                {status?.rain_active ? 'Active' : 'Dry'}
              </button>
            </div>

            {/* Sensor Fault Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-[#A9BBA0]/30">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className={`w-5 h-5 ${status?.sensor_fault ? 'text-rose-600' : 'text-[#778078]'}`} />
                <div>
                  <span className="text-xs font-bold text-[#27342C] block">Sensor Fault Interlock</span>
                  <span className="text-[11px] text-[#778078]">{status?.sensor_fault ? 'Simulated Disconnect' : 'Sensors Healthy'}</span>
                </div>
              </div>
              <button
                onClick={handleToggleFault}
                disabled={isSubmitting}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  status?.sensor_fault ? 'bg-rose-600 text-white' : 'bg-[#E7EFE4] text-[#244B36]'
                }`}
              >
                {status?.sensor_fault ? 'Faulted' : 'Healthy'}
              </button>
            </div>
          </div>

          {/* SEED 24-HOUR HISTORICAL SENSOR TREND */}
          <div className="pt-2">
            <button
              onClick={handleSeedHistory}
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-[#F2EBDD] hover:bg-[#DCCCB2]/60 text-[#244B36] font-bold text-xs flex items-center justify-center gap-2 border border-[#A9BBA0]/40 transition-colors cursor-pointer"
            >
              <Database className="w-4 h-4 text-[#557A52]" />
              <span>Seed 24-Hour Synthetic Trend Data</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
