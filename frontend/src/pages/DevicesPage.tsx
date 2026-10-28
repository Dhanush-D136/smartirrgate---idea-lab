import React, { useState, useEffect } from 'react';
import { Cpu, Server, Power, Droplets, Thermometer, Sun, CloudRain, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Info } from 'lucide-react';
import { api } from '../services/api';
import { DeviceInfo } from '../types';

export const DevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);

  const fetchDevices = async () => {
    try {
      const res = await api.getDevices();
      setDevices(res.devices);
      if (res.devices.length > 0 && !selectedDevice) {
        setSelectedDevice(res.devices[0]);
      }
    } catch (err) {
      console.error('Failed to load devices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Online
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Stale
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-300">
            <XCircle className="w-3.5 h-3.5 text-zinc-500" /> Offline
          </span>
        );
    }
  };

  const getDeviceIcon = (type: string, id: string) => {
    if (id.includes('esp32')) return <Cpu className="w-5 h-5 text-[#244B36]" />;
    if (id.includes('rpi')) return <Server className="w-5 h-5 text-[#557A52]" />;
    if (id.includes('pump')) return <Power className="w-5 h-5 text-indigo-600" />;
    if (id.includes('moisture')) return <Droplets className="w-5 h-5 text-blue-600" />;
    if (id.includes('dht')) return <Thermometer className="w-5 h-5 text-rose-600" />;
    if (id.includes('ldr')) return <Sun className="w-5 h-5 text-amber-600" />;
    if (id.includes('rain')) return <CloudRain className="w-5 h-5 text-cyan-600" />;
    return <Cpu className="w-5 h-5 text-[#244B36]" />;
  };

  return (
    <div className="space-y-6 pb-20 md:pb-10">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27342C] font-['Outfit']">Hardware Devices & Sensors</h1>
          <p className="text-xs sm:text-sm text-[#778078]">Field controllers, actuators, and analog/digital transducers</p>
        </div>
        <button
          onClick={fetchDevices}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#A9BBA0]/40 text-xs font-semibold text-[#244B36] hover:bg-[#E7EFE4] shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Scan Network</span>
        </button>
      </div>

      {/* Grid of Device Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {devices.map((device) => (
          <div
            key={device.id}
            onClick={() => setSelectedDevice(device)}
            className={`rounded-3xl p-5 border transition-all cursor-pointer ${
              selectedDevice?.id === device.id
                ? 'bg-white border-[#244B36] shadow-lg ring-2 ring-[#244B36]/20'
                : 'glass-panel hover:bg-white/95'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#E7EFE4] flex items-center justify-center">
                  {getDeviceIcon(device.type, device.id)}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#27342C]">{device.name}</h3>
                  <code className="text-[10px] text-[#778078] font-mono">{device.device_id}</code>
                </div>
              </div>
              {getStatusBadge(device.status)}
            </div>

            <p className="text-xs text-[#778078] line-clamp-2 mb-4">{device.description}</p>

            <div className="pt-3 border-t border-[#A9BBA0]/20 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#778078]">Hardware:</span>
                <span className="font-medium text-[#27342C]">{device.hardware}</span>
              </div>
              {device.last_reading && (
                <div className="flex justify-between">
                  <span className="text-[#778078]">Latest Telemetry:</span>
                  <span className="font-bold text-[#244B36]">{device.last_reading}</span>
                </div>
              )}
              {device.firmware_version && (
                <div className="flex justify-between">
                  <span className="text-[#778078]">Firmware:</span>
                  <span className="font-mono text-[11px] text-[#27342C]">{device.firmware_version}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#778078]">Last Seen:</span>
                <span className="text-[11px] text-[#27342C]">
                  {device.last_seen ? new Date(device.last_seen).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Selected Device Deep Diagnostic Panel */}
      {selectedDevice && (
        <div className="rounded-3xl glass-panel p-6 shadow-xl border border-[#A9BBA0]/40 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#A9BBA0]/30">
            <Info className="w-5 h-5 text-[#557A52]" />
            <h2 className="font-bold text-base text-[#27342C]">Commissioning & Diagnostic Information: {selectedDevice.name}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-[#FAF8F1] border border-[#A9BBA0]/30 space-y-2">
              <span className="font-bold text-[#244B36] uppercase tracking-wider text-[10px] block">Hardware Specifications</span>
              <p className="text-[#27342C]"><strong className="text-[#778078]">Board:</strong> {selectedDevice.hardware}</p>
              <p className="text-[#27342C]"><strong className="text-[#778078]">Network IP:</strong> {selectedDevice.ip_address || 'DHCP Assigned'}</p>
              <p className="text-[#27342C]"><strong className="text-[#778078]">Status:</strong> {selectedDevice.status}</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF8F1] border border-[#A9BBA0]/30 space-y-2">
              <span className="font-bold text-[#244B36] uppercase tracking-wider text-[10px] block">Telemetry & MQTT Topics</span>
              <p className="font-mono text-[11px] text-[#27342C]">smartirrigate/{selectedDevice.device_id}/telemetry</p>
              <p className="font-mono text-[11px] text-[#27342C]">smartirrigate/{selectedDevice.device_id}/commands</p>
              <p className="font-mono text-[11px] text-[#27342C]">smartirrigate/{selectedDevice.device_id}/command-ack</p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF8F1] border border-[#A9BBA0]/30 space-y-2">
              <span className="font-bold text-[#244B36] uppercase tracking-wider text-[10px] block">Safety Limits & Isolation</span>
              <p className="text-[#27342C]">Optocoupler Isolation: 1500V RMS</p>
              <p className="text-[#27342C]">Hardware Watchdog: 300s cutoff</p>
              <p className="text-[#27342C]">Boot Failsafe: GPIO 23 LOW on startup</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
