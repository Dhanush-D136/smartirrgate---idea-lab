import React, { useState } from 'react';
import { X, Play, Square, AlertOctagon, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { PumpState } from '../types';

interface PumpControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPumpState: PumpState;
  onCommandIssued: () => void;
  systemMode?: 'SIMULATION' | 'HARDWARE';
}

export const PumpControlModal: React.FC<PumpControlModalProps> = ({
  isOpen,
  onClose,
  currentPumpState,
  onCommandIssued,
  systemMode = 'SIMULATION'
}) => {
  const [durationMinutes, setDurationMinutes] = useState<number>(3);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [commandStage, setCommandStage] = useState<'IDLE' | 'SENT' | 'ACKNOWLEDGED'>('IDLE');

  if (!isOpen) return null;

  const isPumpActive = currentPumpState === 'RUNNING' || currentPumpState === 'STARTING';

  const handleCommand = async (action: 'START_PUMP' | 'STOP_PUMP' | 'EMERGENCY_STOP') => {
    setIsSubmitting(true);
    setStatusNotification(null);
    setCommandStage('SENT');
    try {
      const durationSecs = action === 'START_PUMP' ? durationMinutes * 60 : undefined;
      const res = await api.sendIrrigationCommand(
        action,
        durationSecs,
        action === 'EMERGENCY_STOP' 
          ? 'Operator Emergency Stop Triggered' 
          : action === 'STOP_PUMP'
          ? 'Manual operator stop request'
          : `Operator Remote Control (${durationMinutes} min)`
      );
      
      setCommandStage('ACKNOWLEDGED');
      
      if (action === 'STOP_PUMP' || action === 'EMERGENCY_STOP') {
        if (res.status === 'SUCCESS' || res.status === 'SENT' || res.status === 'EXECUTED') {
          setStatusNotification({
            type: 'success',
            message: 'Irrigation stopped successfully.'
          });
        } else {
          setStatusNotification({
            type: 'error',
            message: 'Unable to confirm that irrigation has stopped. Check device connectivity.'
          });
        }
      } else {
        setStatusNotification({
          type: 'success',
          message: res.message || 'Irrigation command sent successfully.'
        });
      }

      onCommandIssued();
    } catch (err: any) {
      setCommandStage('IDLE');
      if (action === 'STOP_PUMP') {
        setStatusNotification({
          type: 'error',
          message: 'Unable to confirm that irrigation has stopped. Check device connectivity.'
        });
      } else {
        setStatusNotification({
          type: 'error',
          message: err.message || 'Command dispatch failed'
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FAF8F1] w-full max-w-lg rounded-3xl shadow-2xl border border-[#A9BBA0]/40 overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#A9BBA0]/30 flex items-center justify-between bg-[#E7EFE4]/80">
          <div>
            <h3 className="font-bold text-lg text-[#27342C] font-['Outfit']">Authoritative Pump Actuator</h3>
            <p className="text-xs text-[#778078]">Zone 01 • Deterministic relay pipeline with physical acknowledgement</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#778078] hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 3-Stage Pump Pipeline Indicator */}
          <div className="p-4 rounded-2xl bg-white border border-[#A9BBA0]/30 space-y-3">
            <span className="text-[10px] font-bold text-[#778078] uppercase tracking-wider block">
              Actuator Pipeline State
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className={`p-2.5 rounded-xl border ${commandStage !== 'IDLE' ? 'bg-[#E7EFE4] text-[#244B36] border-[#557A52] font-semibold' : 'bg-[#FAF8F1] text-[#778078] border-[#A9BBA0]/30'}`}>
                <span className="block font-bold">1. Dispatched</span>
                <span className="text-[10px]">Command Queued</span>
              </div>
              <div className={`p-2.5 rounded-xl border ${commandStage === 'ACKNOWLEDGED' ? 'bg-[#E7EFE4] text-[#244B36] border-[#557A52] font-semibold' : 'bg-[#FAF8F1] text-[#778078] border-[#A9BBA0]/30'}`}>
                <span className="block font-bold">2. Acknowledged</span>
                <span className="text-[10px]">Controller Confirmed</span>
              </div>
              <div className={`p-2.5 rounded-xl border font-bold ${
                isPumpActive 
                  ? 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse' 
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}>
                <span className="block font-bold">3. Confirmed</span>
                <span className="text-[10px]">{currentPumpState}</span>
              </div>
            </div>
          </div>

          {/* Runtime Duration setting for Start */}
          {!isPumpActive && (
            <div>
              <label className="block text-xs font-semibold text-[#27342C] mb-1.5">
                Target Irrigation Runtime (Minutes):
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 5, 10].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDurationMinutes(mins)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      durationMinutes === mins
                        ? 'bg-[#244B36] text-white border-[#244B36] shadow-xs'
                        : 'bg-white text-[#27342C] border-[#A9BBA0]/40 hover:bg-[#E7EFE4]'
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#778078] mt-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#557A52]" />
                Hardware watchdog will auto-cutoff after {durationMinutes * 60} seconds maximum.
              </p>
            </div>
          )}

          {/* Feedback message banner */}
          {statusNotification && (
            <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${
              statusNotification.type === 'success' 
                ? 'bg-[#E7EFE4] border-[#557A52]/40 text-[#244B36]' 
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}>
              {statusNotification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#557A52] shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusNotification.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {isPumpActive ? (
              <button
                onClick={() => handleCommand('STOP_PUMP')}
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-900 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Square className="w-4 h-4 text-rose-400" />
                <span>{isSubmitting ? 'Stopping...' : 'Stop Irrigation'}</span>
              </button>
            ) : (
              <button
                onClick={() => handleCommand('START_PUMP')}
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-[#244B36] hover:bg-[#1a3828] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 text-[#A9BBA0]" />
                <span>{isSubmitting ? 'Starting...' : `Confirm & Start Pump (${durationMinutes} min)`}</span>
              </button>
            )}

            {/* Emergency Stop Button */}
            <button
              onClick={() => handleCommand('EMERGENCY_STOP')}
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-[#B84B43] border border-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Emergency Cutoff</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
