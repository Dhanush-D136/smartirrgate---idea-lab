import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Sprout, 
  LayoutDashboard, 
  BarChart3, 
  Droplet, 
  Cpu, 
  Settings, 
  Activity, 
  FlaskConical,
  HardDrive,
  LogOut,
  User as UserIcon,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { api } from '../services/api';

interface NavbarProps {
  onOpenSimulator: () => void;
  systemMode?: 'SIMULATION' | 'HARDWARE';
  onModeChanged?: (mode: 'SIMULATION' | 'HARDWARE') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSimulator, systemMode = 'SIMULATION', onModeChanged }) => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { isConnected } = useRealtime();
  const [currentMode, setCurrentMode] = useState<'SIMULATION' | 'HARDWARE'>(systemMode);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);

  useEffect(() => {
    setCurrentMode(systemMode);
  }, [systemMode]);

  const handleToggleMode = async () => {
    const nextMode = currentMode === 'SIMULATION' ? 'HARDWARE' : 'SIMULATION';
    if (confirm(`Switch to ${nextMode} Mode?\n\n${nextMode === 'HARDWARE' ? 'Hardware Mode reads live ESP32 & Raspberry Pi sensors and controls physical relays.' : 'Simulator Mode generates synthetic test telemetry without actuating real hardware.'}`)) {
      setIsSwitching(true);
      try {
        await api.setSystemMode(nextMode);
        setCurrentMode(nextMode);
        if (onModeChanged) onModeChanged(nextMode);
      } catch (err: any) {
        alert(`Failed to switch mode: ${err.message}`);
      } finally {
        setIsSwitching(false);
      }
    }
  };

  const navLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/irrigation', label: 'Management', icon: Droplet },
    { to: '/history', label: 'Analytics', icon: BarChart3 },
    { to: '/devices', label: 'Devices', icon: Cpu },
    { to: '/diagnostics', label: 'Diagnostics', icon: Activity },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F1]/90 backdrop-blur-md border-b border-[#A9BBA0]/30 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[#244B36] flex items-center justify-center text-[#FAF8F1] shadow-md group-hover:scale-105 transition-transform">
              <Sprout className="w-6 h-6 text-[#A9BBA0]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-2xl tracking-tight text-[#244B36] font-['Outfit']">greenish</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#E7EFE4] text-[#244B36] font-semibold border border-[#A9BBA0]/40">vel</span>
              </div>
              <p className="text-[10px] tracking-wider text-[#778078] uppercase font-medium hidden sm:block">Sense. Decide. Irrigate.</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs lg:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#244B36] text-[#FAF8F1] shadow-sm'
                      : 'text-[#27342C]/80 hover:text-[#244B36] hover:bg-[#E7EFE4]/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FAF8F1]' : 'text-[#557A52]'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Primary Mode Selector: SIMULATOR vs HARDWARE */}
            <button
              onClick={handleToggleMode}
              disabled={isSwitching}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs ${
                currentMode === 'SIMULATION'
                  ? 'bg-amber-500/15 text-amber-900 border-amber-400/50 hover:bg-amber-500/25'
                  : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
              }`}
              title="Click to toggle between Simulator and Real Hardware Mode"
            >
              {isSwitching ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : currentMode === 'SIMULATION' ? (
                <FlaskConical className="w-3.5 h-3.5 text-amber-700" />
              ) : (
                <HardDrive className="w-3.5 h-3.5 text-emerald-200" />
              )}
              <span>{currentMode === 'SIMULATION' ? 'SIMULATOR MODE' : 'HARDWARE MODE'}</span>
            </button>

            {/* Test Simulator Controls Drawer Trigger */}
            <button
              onClick={onOpenSimulator}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-[#FAF8F1] text-[#778078] hover:text-[#244B36] border border-[#A9BBA0]/40 hover:bg-[#F2EBDD] transition-colors shadow-xs"
              title="Open Simulation Controls Panel"
            >
              <FlaskConical className="w-3.5 h-3.5 text-[#C58A32]" />
              <span className="hidden lg:inline">Sim Controls</span>
            </button>

            {/* Live Gateway Pill */}
            <div 
              title={isConnected ? 'Live WebSocket Connected' : 'Connecting to Live Socket...'}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#E7EFE4] text-[#244B36] border border-[#A9BBA0]/40"
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isConnected ? 'Live' : 'Offline'}</span>
            </div>

            {/* User Profile / Auth Button */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2 pl-2 border-l border-[#A9BBA0]/30">
                <div className="w-8 h-8 rounded-full bg-[#244B36] text-[#FAF8F1] flex items-center justify-center font-bold text-xs shadow-sm">
                  {user?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-1.5 rounded-lg text-[#778078] hover:text-[#B84B43] hover:bg-[#E7EFE4] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#244B36] text-[#FAF8F1] hover:bg-[#1a3828] transition-colors shadow-sm"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
