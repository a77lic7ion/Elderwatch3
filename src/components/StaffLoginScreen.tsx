import React, { useState, useEffect } from 'react';
import { Shield, Lock, Mail, AlertCircle, Smartphone, Building, Sparkles, UserCheck, ArrowRight } from 'lucide-react';
import { StaffUser, Home } from '../types';
import { ThemeToggle, useAppTheme } from './ThemeToggle';

interface StaffLoginScreenProps {
  onLoginSuccess: (token: string, user: StaffUser, home: Home) => void;
  onNavigateToResidentScreen: () => void;
}

interface DemoAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  homeId: string;
  homeName: string;
}

export const StaffLoginScreen: React.FC<StaffLoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToResidentScreen,
}) => {
  const [isNight] = useAppTheme();
  const [email, setEmail] = useState('shaunwgordon@gmail.com');
  const [password, setPassword] = useState('B33tl3sL1lly@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    fetch('/api/auth/demo-accounts')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.accounts)) {
          setDemoAccounts(data.accounts);
        }
      })
      .catch(() => {
        // Fallback to static accounts if network fails
        setDemoAccounts([
          {
            id: 'staff-admin-shaun',
            name: 'Shaun Gordon',
            email: 'shaunwgordon@gmail.com',
            password: 'B33tl3sL1lly@123',
            role: 'admin',
            homeId: 'home-methodist-1',
            homeName: 'Methodist Home 1',
          },
          {
            id: 'staff-nurse-mary',
            name: 'Mary Nurse',
            email: 'marynurse@methodist.care',
            password: 'Marynurse@123',
            role: 'nurse',
            homeId: 'home-methodist-1',
            homeName: 'Methodist Home 1',
          },
        ]);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.token) {
        setError(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }

      onLoginSuccess(data.token, data.user, data.home);
    } catch {
      setError('Connection error logging in. Please check server connection.');
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-between p-6 sm:p-10 transition-colors duration-200 ${
        isNight ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
            EW
          </div>
          <div>
            <h1 className={`text-xl font-bold tracking-tight ${isNight ? 'text-white' : 'text-slate-900'}`}>
              ElderWatch
            </h1>
            <p className={`text-xs ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
              Old-Age & Frailcare Wellness Protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Prominent Global Theme Switcher */}
          <ThemeToggle />

          <button
            onClick={onNavigateToResidentScreen}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition cursor-pointer ${
              isNight
                ? 'border-slate-800 bg-slate-900 text-slate-200 hover:text-white hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
            <span>Switch to Resident Screen</span>
          </button>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md mx-auto my-auto w-full space-y-6">
        <div
          className={`rounded-3xl p-6 sm:p-8 border shadow-2xl space-y-6 transition-colors ${
            isNight
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="space-y-1">
            <h2 className={`text-2xl font-bold ${isNight ? 'text-white' : 'text-slate-900'}`}>
              Staff & Admin Portal
            </h2>
            <p className={`text-xs sm:text-sm ${isNight ? 'text-slate-300' : 'text-slate-600'}`}>
              Sign in to manage care homes, assign staff, and monitor live resident check-in statuses.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-300 text-xs bg-rose-950/50 p-3 rounded-xl border border-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className={`block font-bold uppercase tracking-wider mb-1 ${isNight ? 'text-slate-300' : 'text-slate-700'}`}>
                Email Address or Username
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border focus:outline-hidden text-sm ${
                    isNight
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block font-bold uppercase tracking-wider mb-1 ${isNight ? 'text-slate-300' : 'text-slate-700'}`}>
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border focus:outline-hidden text-sm ${
                    isNight
                      ? 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 font-bold text-white text-sm shadow-lg shadow-emerald-950/50 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Dashboard'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className={`pt-4 border-t space-y-2.5 ${isNight ? 'border-slate-800' : 'border-slate-200'}`}>
            <p className={`text-[11px] font-semibold flex items-center gap-1 ${isNight ? 'text-slate-400' : 'text-slate-600'}`}>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Available Accounts (One-Click Quick Fill):</span>
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {demoAccounts.map((acc) => {
                const isAdmin = acc.role === 'admin';
                const isSelected = email === acc.email;
                return (
                  <button
                    key={acc.id || acc.email}
                    type="button"
                    onClick={() => handleQuickDemoLogin(acc.email, acc.password || '')}
                    className={`w-full p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? isNight
                          ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                          : 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
                        : isNight
                        ? 'bg-slate-950/70 hover:bg-slate-800 border-slate-800'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-bold flex items-center gap-1.5 ${isNight ? 'text-white' : 'text-slate-900'}`}>
                        {acc.name}
                        {isSelected && (
                          <span className="text-[10px] text-emerald-500 font-normal">(Selected)</span>
                        )}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          isAdmin
                            ? 'text-purple-400 bg-purple-950/60 border border-purple-800/60'
                            : 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                        }`}
                      >
                        {isAdmin ? 'Admin View' : `${acc.role} View`}
                      </span>
                    </div>
                    <div className={`text-[11px] mt-1 flex items-center justify-between gap-1 ${isNight ? 'text-slate-400' : 'text-slate-600'}`}>
                      <div className="flex items-center gap-1 truncate">
                        {isAdmin ? (
                          <Shield className="w-3 h-3 text-purple-400 shrink-0" />
                        ) : (
                          <Building className="w-3 h-3 text-emerald-500 shrink-0" />
                        )}
                        <span className="truncate">
                          {isAdmin ? 'All Homes & Staff Overview' : acc.homeName}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {acc.email}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`text-center text-xs flex items-center justify-center gap-2 ${isNight ? 'text-slate-500' : 'text-slate-400'}`}>
        <Shield className="w-4 h-4 text-emerald-500" />
        <span>Multi-Tenant High-Security Frailcare System</span>
      </div>
    </div>
  );
};
