import React, { useState, useEffect } from 'react';
import { StaffLoginScreen } from './components/StaffLoginScreen';
import { AdminPanel } from './components/AdminPanel';
import { ResidentCheckInScreen } from './components/ResidentCheckInScreen';
import { DeviceLinkScreen } from './components/DeviceLinkScreen';
import { OfflineIndicator } from './components/PWAInstallButton';
import { ThemeToggle, useAppTheme } from './components/ThemeToggle';
import { StaffUser, Home, DeviceBinding } from './types';

export default function App() {
  // Routes: 'admin' | 'checkin' | 'link'
  const [currentRoute, setCurrentRoute] = useState<'admin' | 'checkin' | 'link'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/checkin')) return 'checkin';
      if (path.startsWith('/link')) return 'link';
    }
    return 'admin';
  });

  // Link code parameter if navigating to /link?code=XYZ
  const [linkCodeParam, setLinkCodeParam] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('code') || '';
    }
    return '';
  });

  // Staff Authentication State
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [staffHome, setStaffHome] = useState<Home | null>(null);

  // Restore staff session if present
  useEffect(() => {
    try {
      const savedAuth = localStorage.getItem('elderwatch_staff_auth');
      if (savedAuth) {
        const { token, user, home } = JSON.parse(savedAuth);
        setStaffToken(token);
        setStaffUser(user);
        setStaffHome(home);
      }
    } catch (e) {
      console.error('Failed to parse saved auth:', e);
    }
  }, []);

  // Listen for browser URL back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      if (path.startsWith('/checkin')) {
        setCurrentRoute('checkin');
      } else if (path.startsWith('/link')) {
        setCurrentRoute('link');
        setLinkCodeParam(params.get('code') || '');
      } else {
        setCurrentRoute('admin');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: 'admin' | 'checkin' | 'link', code?: string) => {
    setCurrentRoute(route);
    let path = '/admin';
    if (route === 'checkin') path = '/checkin';
    if (route === 'link') {
      path = code ? `/link?code=${encodeURIComponent(code)}` : '/link';
      if (code) setLinkCodeParam(code);
    }
    window.history.pushState({}, '', path);
  };

  const handleLoginSuccess = (token: string, user: StaffUser, home: Home) => {
    setStaffToken(token);
    setStaffUser(user);
    setStaffHome(home);
    localStorage.setItem(
      'elderwatch_staff_auth',
      JSON.stringify({ token, user, home })
    );
  };

  const handleLogout = () => {
    setStaffToken(null);
    setStaffUser(null);
    setStaffHome(null);
    localStorage.removeItem('elderwatch_staff_auth');
  };

  const handleLinkedSuccess = (binding: DeviceBinding) => {
    console.log('Successfully paired device for:', binding.residentName);
    navigate('checkin');
  };

  const handleSimulateDeviceBind = (code: string) => {
    navigate('link', code);
  };

  const [isNight] = useAppTheme();

  return (
    <div
      className={`min-h-screen antialiased select-none transition-colors duration-200 ${
        isNight
          ? currentRoute === 'checkin'
            ? 'bg-[#1A221E] text-[#F2EEE5]'
            : 'bg-slate-950 text-slate-100'
          : currentRoute === 'checkin'
          ? 'bg-[#FAF7F2] text-stone-900'
          : 'bg-slate-100 text-slate-900'
      }`}
      style={{
        fontFamily: '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif',
      }}
    >
      {/* Offline sync indicator */}
      <OfflineIndicator />

      {/* Floating Environment & Global Theme Control Dock */}
      <div className="fixed bottom-3 right-3 z-50 bg-[#17201B]/95 backdrop-blur-md border border-white/25 rounded-2xl p-1.5 shadow-2xl flex items-center gap-1.5 text-xs">
        <span className="text-[10px] font-bold text-white/60 px-2 uppercase tracking-wider hidden sm:inline">
          View:
        </span>
        <button
          onClick={() => navigate('checkin')}
          className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
            currentRoute === 'checkin'
              ? 'bg-[#157A4C] text-white shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          Resident Screen
        </button>
        <button
          onClick={() => navigate('admin')}
          className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
            currentRoute === 'admin'
              ? 'bg-[#157A4C] text-white shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          Staff & Admin
        </button>
        <button
          onClick={() => navigate('link')}
          className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
            currentRoute === 'link'
              ? 'bg-[#157A4C] text-white shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          Pair Phone
        </button>

        <div className="h-4 w-px bg-white/20 mx-0.5" />

        {/* Unmissable Global Dark/Light Theme Switcher */}
        <ThemeToggle />
      </div>

      {/* ROUTE 1: RESIDENT CHECK-IN SCREEN */}
      {currentRoute === 'checkin' && (
        <ResidentCheckInScreen
          onNavigateToAdmin={() => navigate('admin')}
          onNavigateToLink={(code) => navigate('link', code)}
        />
      )}

      {/* ROUTE 2: DEVICE LINK SCREEN */}
      {currentRoute === 'link' && (
        <DeviceLinkScreen
          initialCode={linkCodeParam}
          onLinkedSuccess={handleLinkedSuccess}
          onCancel={() => navigate('admin')}
        />
      )}

      {/* ROUTE 3: STAFF PORTAL (Admin Panel or Login) */}
      {currentRoute === 'admin' && (
        <>
          {staffToken && staffUser && staffHome ? (
            <AdminPanel
              token={staffToken}
              user={staffUser}
              initialHome={staffHome}
              onLogout={handleLogout}
              onNavigateToResidentScreen={() => navigate('checkin')}
              onSimulateDeviceBind={handleSimulateDeviceBind}
            />
          ) : (
            <StaffLoginScreen
              onLoginSuccess={handleLoginSuccess}
              onNavigateToResidentScreen={() => navigate('checkin')}
            />
          )}
        </>
      )}
    </div>
  );
}
