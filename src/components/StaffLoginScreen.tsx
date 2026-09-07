import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertCircle, Smartphone, ArrowRight } from 'lucide-react';
import { StaffUser, Home } from '../types';
import { ThemeToggle, useAppTheme } from './ThemeToggle';

interface StaffLoginScreenProps {
  onLoginSuccess: (token: string, user: StaffUser, home: Home) => void;
  onNavigateToResidentScreen: () => void;
}

export const StaffLoginScreen: React.FC<StaffLoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToResidentScreen,
}) => {
  const [isNight] = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div
      className={`min-h-screen flex flex-col justify-between p-6 sm:p-10 transition-colors duration-200 ${
        isNight ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/elderwatch-logo.png"
            alt="ElderWatch Logo"
            className="w-12 h-12 rounded-full shadow-lg"
          />
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
          <div className="flex flex-col items-center space-y-3">
            <img
              src="/elderwatch-logo.png"
              alt="ElderWatch"
              className="w-20 h-20 rounded-full shadow-xl"
            />
            <div className="text-center space-y-1">
              <h2 className={`text-2xl font-bold ${isNight ? 'text-white' : 'text-slate-900'}`}>
                Staff & Admin Portal
              </h2>
              <p className={`text-xs sm:text-sm ${isNight ? 'text-slate-300' : 'text-slate-600'}`}>
                Sign in to manage care homes, assign staff, and monitor live resident check-in statuses.
              </p>
            </div>
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
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
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
                  placeholder="Enter your password"
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
