import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Droplet, BarChart3, Cpu, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();

  const tabs = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/devices', label: 'Devices', icon: Cpu },
    { to: '/irrigation', label: 'Irrigation', icon: Droplet },
    { to: '/history', label: 'History', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#FAF8F1]/95 backdrop-blur-lg border-t border-[#A9BBA0]/40 px-2 py-1.5 shadow-lg">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
                isActive ? 'text-[#244B36] font-semibold' : 'text-[#778078] hover:text-[#244B36]'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-[#244B36] text-[#FAF8F1] scale-110 shadow-sm' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
