import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sprout } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { SimulatorDrawer } from './components/SimulatorDrawer';
import { PumpControlModal } from './components/PumpControlModal';

import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { IrrigationPage } from './pages/IrrigationPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { LoginPage } from './pages/LoginPage';

const queryClient = new QueryClient();

// Strict Protected Route wrapper: redirects unauthenticated requests to /login
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1E3E2D] flex flex-col items-center justify-center text-[#FAF8F1] space-y-3 font-['Inter']">
        <div className="w-12 h-12 rounded-2xl bg-[#244B36] flex items-center justify-center shadow-lg animate-pulse">
          <Sprout className="w-7 h-7 text-[#A9BBA0]" />
        </div>
        <span className="text-xs font-semibold text-[#A9BBA0] tracking-wide">Validating SmartIrrigate Session...</span>
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isPumpModalOpen, setIsPumpModalOpen] = useState<boolean>(false);
  const [systemMode, setSystemMode] = useState<'SIMULATION' | 'HARDWARE'>('SIMULATION');
  const [currentPumpState, setCurrentPumpState] = useState<'OFF' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'FAULT' | 'UNKNOWN'>('OFF');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleModeChanged = (newMode: 'SIMULATION' | 'HARDWARE') => {
    setSystemMode(newMode);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F1] text-[#27342C] flex flex-col font-['Inter']">
      
      {/* Top Navbar - rendered on authenticated pages only */}
      {!isLoginPage && (
        <Navbar 
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          systemMode={systemMode}
          onModeChanged={handleModeChanged}
        />
      )}

      {/* Main Content Area */}
      <main className={isLoginPage ? 'w-full flex-1' : 'flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6'}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage
                  systemMode={systemMode}
                  onModeChanged={handleModeChanged}
                  refreshTrigger={refreshTrigger}
                  onOpenPumpModal={() => setIsPumpModalOpen(true)}
                  onOpenSimulator={() => setIsSimulatorOpen(true)}
                  onPumpStateChange={setCurrentPumpState}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/devices"
            element={
              <ProtectedRoute>
                <DevicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/irrigation"
            element={
              <ProtectedRoute>
                <IrrigationPage 
                  onOpenPumpModal={() => setIsPumpModalOpen(true)} 
                  onPumpStateChange={setCurrentPumpState}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage systemMode={systemMode} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage 
                  systemMode={systemMode}
                  onModeChanged={handleModeChanged}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/diagnostics"
            element={
              <ProtectedRoute>
                <DiagnosticsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Mobile Portrait Bottom Navigation Bar - rendered on authenticated pages only */}
      {!isLoginPage && <BottomNav />}

      {/* Global Interactive Hardware Simulator Drawer */}
      <SimulatorDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onTelemetryInjected={() => setRefreshTrigger(prev => prev + 1)}
      />

      {/* Remote Pump Actuator Confirmation Modal */}
      <PumpControlModal
        isOpen={isPumpModalOpen}
        onClose={() => setIsPumpModalOpen(false)}
        currentPumpState={currentPumpState}
        systemMode={systemMode}
        onCommandIssued={() => setRefreshTrigger(prev => prev + 1)}
      />

    </div>
  );
};


export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <Router>
            <AppContent />
          </Router>
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
