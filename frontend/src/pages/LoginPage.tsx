import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sprout, 
  Eye, 
  EyeOff, 
  Lock, 
  Mail, 
  AlertCircle, 
  ArrowRight, 
  HelpCircle, 
  X,
  Activity,
  Cpu,
  Sliders,
  Power,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  
  // Form input state
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both your registered email address and security password.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = () => {
    setEmail('admin@smartirrigate.io');
    setPassword('SmartAdmin2026!');
    setError(null);
  };

  const featureItems = [
    {
      title: 'Real-time Monitoring',
      desc: 'Telemetry from soil, DHT22, light & rain sensors',
      icon: Activity,
    },
    {
      title: 'IoT Connected',
      desc: 'ESP32 field controller & Raspberry Pi 4B edge gateway',
      icon: Cpu,
    },
    {
      title: 'Smart Automation',
      desc: 'Deterministic threshold rules & rain pause policies',
      icon: Sliders,
    },
    {
      title: 'Remote Access',
      desc: '3-stage verified pump command & hardware watchdog',
      icon: Power,
    },
  ];

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between overflow-x-hidden font-['Inter']">
      
      {/* ============================================================== */}
      {/* 1. BRIGHT, CINEMATIC NATURE PHOTOGRAPHY BACKGROUND              */}
      {/* Brilliant blue sky, vibrant golden sunset, mountain lake      */}
      {/* ============================================================== */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ backgroundImage: `url('/assets/login-bg-vibrant.png')` }}
      >
        {/* Subtle, non-dimming exposure gradient: keeps natural sky & mountains vibrant and realistic */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />
      </div>

      {/* ============================================================== */}
      {/* 2. DEDICATED INSTITUTIONAL BRANDING SECTION (TOP-CENTER)       */}
      {/* Seamless, transparent background merging into vibrant sky      */}
      {/* Vel Tech High Tech & AICTE IDEA Lab Logos: Grand, shining masthead */}
      {/* ============================================================== */}
      <header className="relative z-20 w-full px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-1 sm:pb-3">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 sm:gap-8 lg:gap-12">
          
          {/* Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College Logo */}
          <div 
            className="relative inline-flex items-center justify-center group cursor-pointer transition-transform duration-300 hover:scale-[1.04]"
            title="Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College"
          >
            {/* Primary High-Contrast Logo Image (Prominent Main Heading Scale) */}
            <img
              src="/assets/college-logo.png"
              alt="Vel Tech High Tech Dr. Rangarajan Dr. Sakunthala Engineering College"
              className="h-20 sm:h-28 md:h-36 lg:h-44 xl:h-48 w-auto object-contain logo-aura-glow select-none transition-all duration-300"
            />

            {/* Periodic Luminous Diagonal Shine Sweep (Masked to Logo Glyphs) */}
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{
                WebkitMaskImage: 'url(/assets/college-logo.png)',
                maskImage: 'url(/assets/college-logo.png)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            >
              <div className="absolute top-0 bottom-0 left-0 animate-logo-gleam bg-gradient-to-r from-transparent via-white/95 to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Fine Luminous Vertical Divider */}
          <div className="h-16 sm:h-24 md:h-32 lg:h-36 w-[2px] bg-gradient-to-b from-transparent via-white/50 to-transparent rounded-full shadow-[0_0_12px_rgba(255,255,255,0.45)]" />

          {/* AICTE IDEA Lab Official Logo */}
          <div 
            className="relative inline-flex items-center justify-center group cursor-pointer transition-transform duration-300 hover:scale-[1.04]"
            title="AICTE IDEA Lab"
          >
            {/* Primary High-Contrast Logo Image (Prominent Main Heading Scale) */}
            <img
              src="/assets/idea-lab-logo.png"
              alt="AICTE IDEA Lab"
              className="h-18 sm:h-26 md:h-32 lg:h-40 xl:h-44 w-auto object-contain logo-aura-glow-delayed select-none transition-all duration-300"
            />

            {/* Periodic Luminous Diagonal Shine Sweep (Masked to Logo Glyphs) */}
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{
                WebkitMaskImage: 'url(/assets/idea-lab-logo.png)',
                maskImage: 'url(/assets/idea-lab-logo.png)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            >
              <div className="absolute top-0 bottom-0 left-0 animate-logo-gleam-delayed bg-gradient-to-r from-transparent via-white/95 to-transparent pointer-events-none" />
            </div>
          </div>

        </div>
      </header>

      {/* ============================================================== */}
      {/* 3. MAIN CONTENT: SmartIrrigate Left Intro & Right Login Card   */}
      {/* ============================================================== */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* ---------------------------------------------------------- */}
          {/* LEFT SECTION: SmartIrrigate Brand & Feature Cards          */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Translucent Frosted Glass Intro Container for Crisp Readability */}
            <div className="p-6 sm:p-8 rounded-3xl bg-black/40 backdrop-blur-md border border-white/20 text-[#FAF8F1] shadow-2xl space-y-4">
              
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-xs font-bold text-emerald-200">
                  <Sprout className="w-4 h-4 text-emerald-300" />
                  <span>SmartIrrigate • vel greenish</span>
                </div>
                <span className="text-[11px] font-bold tracking-[0.2em] text-[#A9BBA0] uppercase">
                  SENSE. DECIDE. IRRIGATE.
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight font-['Outfit'] text-white leading-tight">
                Smarter Irrigation for a Greener Tomorrow
              </h1>

              <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-xl">
                Monitor your soil, environment, and device status. Control your pump remotely and manage automatic irrigation from one place.
              </p>

              {/* Four Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {featureItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={index}
                      className="p-3.5 rounded-2xl bg-white/12 hover:bg-white/20 backdrop-blur-md border border-white/20 transition-all flex items-start gap-3 shadow-sm"
                    >
                      <div className="p-2 rounded-xl bg-[#244B36]/90 text-white border border-[#A9BBA0]/40 shrink-0">
                        <Icon className="w-4 h-4 text-[#A9BBA0]" />
                      </div>
                      <div>
                        <h2 className="font-bold text-xs sm:text-sm text-white">{item.title}</h2>
                        <p className="text-[11px] text-[#A9BBA0] leading-snug mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>

          {/* ---------------------------------------------------------- */}
          {/* RIGHT SECTION: Premium Nature-Inspired Login Card          */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-md rounded-3xl bg-[#FAF8F1]/96 backdrop-blur-xl p-7 sm:p-9 shadow-2xl border border-[#A9BBA0]/50 text-[#27342C] transition-all">
              
              {/* Card Header */}
              <div className="space-y-1 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#244B36] flex items-center justify-center text-[#FAF8F1] shadow-sm">
                    <Sprout className="w-4 h-4 text-[#A9BBA0]" />
                  </div>
                  <div>
                    <span className="text-xl font-extrabold text-[#244B36] font-['Outfit']">SmartIrrigate</span>
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-2xl font-black text-[#244B36] font-['Outfit'] tracking-tight">
                    Welcome back
                  </h3>
                  <p className="text-xs text-[#778078] leading-relaxed mt-0.5">
                    Sign in to monitor your irrigation system and manage your connected devices.
                  </p>
                </div>
              </div>

              {/* Inline Error Alert */}
              {error && (
                <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-300 text-[#B84B43] text-xs font-semibold flex items-center gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Email Input */}
                <div>
                  <label className="block text-xs font-bold text-[#27342C] mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#778078] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operator@smartirrigate.io"
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-[#A9BBA0]/50 text-xs font-medium text-[#27342C] placeholder-[#778078]/60 focus:outline-none focus:ring-2 focus:ring-[#244B36] focus:border-transparent transition-all shadow-xs"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-[#27342C]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-[11px] font-semibold text-[#557A52] hover:text-[#244B36] hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#778078] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your security password"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-[#A9BBA0]/50 text-xs font-medium text-[#27342C] placeholder-[#778078]/60 focus:outline-none focus:ring-2 focus:ring-[#244B36] focus:border-transparent transition-all shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-[#778078] hover:text-[#27342C] absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Forest Green Sign In Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#244B36] to-[#1E3E2D] hover:from-[#1E3E2D] hover:to-[#162E21] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer mt-1"
                >
                  <span>{isLoading ? 'Verifying Credentials...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

              </form>

              {/* Demo Credentials Access */}
              <div className="mt-5 pt-3.5 border-t border-[#A9BBA0]/30 text-center">
                <button
                  type="button"
                  onClick={handleQuickFill}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E7EFE4] hover:bg-[#d6e5d1] text-[#244B36] text-[11px] font-semibold border border-[#A9BBA0]/40 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#557A52]" />
                  <span>Use Pre-configured Farm Admin Credentials</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* ============================================================== */}
      {/* 4. FOOTER                                                      */}
      {/* ============================================================== */}
      <footer className="relative z-10 w-full px-4 py-3 bg-black/40 backdrop-blur-md border-t border-white/10 text-center text-[11px] text-[#FAF8F1]/80">
        <span>SmartIrrigate • Sense. Decide. Irrigate. • Vel Tech High Tech & AICTE IDEA Lab</span>
      </footer>

      {/* ============================================================== */}
      {/* 5. FORGOT PASSWORD RECOVERY MODAL                              */}
      {/* ============================================================== */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#FAF8F1] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-[#A9BBA0]/40 text-[#27342C] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-[#A9BBA0]/30">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#244B36]" />
                <h3 className="font-bold text-sm">Account Recovery</h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-1 rounded-lg text-[#778078] hover:bg-[#E7EFE4] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-[#778078] leading-relaxed">
              SmartIrrigate is configured for secure on-premise IoT edge installations. To reset your operator credentials:
            </p>

            <div className="p-3.5 rounded-2xl bg-[#E7EFE4] border border-[#A9BBA0]/40 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#557A52] shrink-0 mt-0.5" />
                <p><strong>System Administrator:</strong> Contact your on-site network supervisor at <code className="text-[#244B36] font-semibold">admin@smartirrigate.io</code></p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#557A52] shrink-0 mt-0.5" />
                <p><strong>Edge Gateway Terminal:</strong> Execute password reset utilities directly via the local Raspberry Pi terminal.</p>
              </div>
            </div>

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 rounded-2xl bg-[#244B36] text-white text-xs font-semibold hover:bg-[#1a3828] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
