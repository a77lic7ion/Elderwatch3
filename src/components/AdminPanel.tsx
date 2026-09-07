import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Activity,
  QrCode,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  HelpCircle,
  Search,
  Plus,
  Trash2,
  Edit2,
  Volume2,
  VolumeX,
  RefreshCw,
  LogOut,
  Smartphone,
  ExternalLink,
  Shield,
  Bell,
  Play,
  FileText,
  Info,
  Check,
  Building,
  Upload,
  Link2,
} from 'lucide-react';
import { ResidentTodayView, Home, StaffUser, JobExecutionLog, PushNotificationRecord } from '../types';
import { playEmergencyAlertSound } from '../utils/audioAlert';
import { AddEditResidentModal } from './AddEditResidentModal';
import { ResidentDetailModal } from './ResidentDetailModal';
import { DeviceLinkQRModal } from './DeviceLinkQRModal';
import { BackendEvaluationModal } from './BackendEvaluationModal';
import { PWAInstallButton } from './PWAInstallButton';
import { AdminOverviewView } from './AdminOverviewView';
import { ThemeToggle, useAppTheme } from './ThemeToggle';
import {
  subscribeToTodayCheckins,
  validateFirestoreConnection,
  firebaseConfig,
} from '../lib/firebase';
import { fetchResidents as fetchFirebaseResidents, fetchAllHomes as fetchFirebaseAllHomes, updateHomeSettings } from '../lib/firebase-api';

interface AdminPanelProps {
  token: string;
  user: StaffUser;
  initialHome: Home;
  onLogout: () => void;
  onNavigateToResidentScreen: () => void;
  onSimulateDeviceBind: (code: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  token,
  user,
  initialHome,
  onLogout,
  onNavigateToResidentScreen,
  onSimulateDeviceBind,
}) => {
  const [isNight] = useAppTheme();
  const [activeTab, setActiveTab] = useState<'overview' | 'dashboard' | 'residents' | 'linking' | 'settings'>(
    user.role === 'admin' ? 'overview' : 'dashboard'
  );
  const [home, setHome] = useState<Home>(initialHome);
  const [residents, setResidents] = useState<ResidentTodayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_ok' | 'awaiting' | 'no_response' | 'ok'>('all');

  // Modals
  const [selectedResidentForDetail, setSelectedResidentForDetail] = useState<ResidentTodayView | null>(null);
  const [selectedResidentForQR, setSelectedResidentForQR] = useState<ResidentTodayView | null>(null);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingResident, setEditingResident] = useState<ResidentTodayView | null>(null);
  const [isEvaluationModalOpen, setIsEvaluationModalOpen] = useState(false);

  // Settings state
  const [homeNameInput, setHomeNameInput] = useState(initialHome.name);
  const [cutoffTimeInput, setCutoffTimeInput] = useState(initialHome.cutoffTime);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState('');

  // Audio and Realtime State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [urgentAlertBanner, setUrgentAlertBanner] = useState<{
    text: string;
    room: string;
    residentName: string;
    time: string;
  } | null>(null);

  // Job and Push Logs
  const [jobLogs, setJobLogs] = useState<JobExecutionLog[]>([]);
  const [pushLogs, setPushLogs] = useState<PushNotificationRecord[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [jobFeedbackMsg, setJobFeedbackMsg] = useState('');

  // Multi-tenant testing: list of all homes
  const [allHomes, setAllHomes] = useState<Home[]>([]);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean | null>(null);

  // Fetch all residents and data (using Firebase direct)
  const fetchResidents = useCallback(async () => {
    try {
      const data = await fetchFirebaseResidents(home.id);
      setResidents(data || []);
    } catch (err) {
      console.error('Failed to fetch residents:', err);
    } finally {
      setLoading(false);
    }
  }, [home.id]);

  const fetchLogs = useCallback(async () => {
    // Logs are read from Firestore directly via subscribeToTodayCheckins
    // No REST API needed - the realtime listener handles updates
  }, []);

  const fetchAllHomes = useCallback(async () => {
    try {
      const homes = await fetchFirebaseAllHomes();
      setAllHomes(homes || []);
    } catch (err) {
      console.error('Failed to fetch homes list:', err);
    }
  }, []);

  useEffect(() => {
    fetchResidents();
    fetchLogs();
    fetchAllHomes();
  }, [fetchResidents, fetchLogs, fetchAllHomes]);

  // Firestore Real-Time Listener (Direct Firebase Sync for frailcare-checkin)
  useEffect(() => {
    validateFirestoreConnection().then((res) => {
      setFirestoreConnected(res.connected);
      setRealtimeConnected(res.connected);
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const unsubscribe = subscribeToTodayCheckins(home.id, todayStr, () => {
      fetchResidents();
      fetchLogs();
    });

    return () => {
      unsubscribe();
    };
  }, [home.id, fetchResidents, fetchLogs]);

  // Statistics Calculation
  const stats = useMemo(() => {
    const total = residents.length;
    const ok = residents.filter((r) => r.todayStatus === 'ok').length;
    const notOk = residents.filter((r) => r.todayStatus === 'not_ok').length;
    const noResponse = residents.filter((r) => r.todayStatus === 'no_response').length;
    const awaiting = residents.filter((r) => r.todayStatus === 'awaiting').length;
    const linked = residents.filter((r) => r.isDeviceLinked).length;

    return { total, ok, notOk, noResponse, awaiting, linked, urgentTotal: notOk + noResponse };
  }, [residents]);

  // SORT WORST-FIRST RULE:
  // 1. Red (not_ok) at TOP
  // 2. Grey (no_response & awaiting) in MIDDLE
  // 3. Green (ok) at BOTTOM
  const sortedAndFilteredResidents = useMemo(() => {
    const priorityWeight: Record<string, number> = {
      not_ok: 1,       // Highest priority: top
      no_response: 2,  // Missed cutoff: high attention
      awaiting: 3,     // Still pending
      ok: 4,           // Checked in safe: bottom
    };

    return residents
      .filter((r) => {
        if (statusFilter !== 'all' && r.todayStatus !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            r.name.toLowerCase().includes(q) ||
            r.roomNumber.toLowerCase().includes(q) ||
            (r.phone && r.phone.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => {
        const weightA = priorityWeight[a.todayStatus] || 5;
        const weightB = priorityWeight[b.todayStatus] || 5;
        if (weightA !== weightB) {
          return weightA - weightB;
        }
        // Secondary sort: Room number ascending
        return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
      });
  }, [residents, statusFilter, searchQuery]);

  // Handlers
  const handleSaveResident = async (data: Partial<ResidentTodayView>) => {
    const url = editingResident ? `/api/residents/${editingResident.id}` : '/api/residents';
    const method = editingResident ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to save resident');
    }

    await fetchResidents();
  };

  const handleDeleteResident = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove resident ${name}?`)) return;

    const res = await fetch(`/api/residents/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      fetchResidents();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccessMsg('');

    try {
      const updated = await updateHomeSettings(home.id, homeNameInput, cutoffTimeInput);
      if (updated) {
        setHome(updated);
        setSettingsSuccessMsg('Facility settings updated successfully!');
        setTimeout(() => setSettingsSuccessMsg(''), 4000);
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  // Trigger manual jobs
  const handleTriggerJob = async (endpoint: string, jobName: string) => {
    setRunningJob(jobName);
    setJobFeedbackMsg('');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setJobFeedbackMsg(data.message || `${jobName} executed.`);
        fetchResidents();
        fetchLogs();
      }
    } catch {
      setJobFeedbackMsg(`Failed to trigger ${jobName}`);
    } finally {
      setRunningJob(null);
      setTimeout(() => setJobFeedbackMsg(''), 5000);
    }
  };

  // CSV Import Handler
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      alert('CSV must have a header row and at least one data row.');
      return;
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const nameIdx = header.findIndex(h => h.includes('name'));
    const roomIdx = header.findIndex(h => h.includes('room'));
    const phoneIdx = header.findIndex(h => h.includes('phone'));
    const ecIdx = header.findIndex(h => h.includes('emergency') || h.includes('contact'));
    const notesIdx = header.findIndex(h => h.includes('note'));

    if (nameIdx === -1 || roomIdx === -1) {
      alert('CSV must have "name" and "room" columns.');
      return;
    }

    const residents = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      return {
        name: cols[nameIdx] || '',
        roomNumber: cols[roomIdx] || '',
        phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
        emergencyContact: ecIdx >= 0 ? cols[ecIdx] || '' : '',
        notes: notesIdx >= 0 ? cols[notesIdx] || '' : '',
      };
    }).filter(r => r.name && r.roomNumber);

    if (residents.length === 0) {
      alert('No valid residents found in CSV.');
      return;
    }

    if (!confirm(`Import ${residents.length} residents into ${home.name}?`)) return;

    try {
      const { batchImportResidents } = await import('../lib/firebase-api');
      const results = await batchImportResidents(home.id, residents);
      alert(`Successfully imported ${results.length} residents.`);
      fetchResidents();
    } catch (err) {
      alert('Failed to import residents: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    e.target.value = '';
  };

  // Batch Link Code Export
  const handleBatchLinkCodes = () => {
    const origin = window.location.origin;
    const lines = ['Room,Name,Link Code,Pairing URL,Check-in URL'];
    residents.forEach(r => {
      const pairingUrl = `${origin}/link?code=${encodeURIComponent(r.oneTimeLinkCode || '')}`;
      const checkinUrl = `${origin}/checkin/${r.id}`;
      lines.push(`"${r.roomNumber}","${r.name}","${r.oneTimeLinkCode || 'N/A'}","${pairingUrl}","${checkinUrl}"`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elderwatch-link-codes-${home.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Regenerate Link Code
  const handleRegenerateLinkCode = async (residentId: string, roomNumber: string, residentName: string) => {
    if (!confirm(`Regenerate link code for "${residentName}"? This will invalidate any existing pairing.`)) return;
    try {
      const { regenerateLinkCode } = await import('../lib/firebase-api');
      const newCode = await regenerateLinkCode(residentId, roomNumber);
      alert(`New link code for ${residentName}: ${newCode}`);
      fetchResidents();
    } catch (err) {
      alert('Failed to regenerate code: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isNight ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* URGENT ALARM BANNER (if any not_ok resident) */}
      {urgentAlertBanner && (
        <div className="bg-rose-600 text-white px-4 py-3 shadow-lg flex items-center justify-between animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-bounce">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-extrabold text-sm sm:text-base tracking-tight">
                EMERGENCY ALERT: {urgentAlertBanner.residentName} (Room {urgentAlertBanner.room})
              </p>
              <p className="text-xs text-rose-100">
                Resident pressed RED "I need help" at {urgentAlertBanner.time} SAST. Please dispatch nursing staff immediately.
              </p>
            </div>
          </div>
          <button
            onClick={() => setUrgentAlertBanner(null)}
            className="text-xs bg-white text-rose-700 font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-rose-50 transition cursor-pointer"
          >
            Acknowledge Alert
          </button>
        </div>
      )}

      {/* TOP APPLICATION BAR */}
      <header
        className={`border-b sticky top-0 z-30 shadow-xs transition-colors duration-200 ${
          isNight ? 'bg-slate-900/95 backdrop-blur-md border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Home Scope */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-md">
              EW
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-extrabold text-base sm:text-lg tracking-tight ${isNight ? 'text-white' : 'text-slate-900'}`}>
                  ElderWatch
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  STAFF PORTAL
                </span>
                {realtimeConnected ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    Connecting...
                  </span>
                )}
                <button
                  onClick={() => setIsEvaluationModalOpen(true)}
                  title={`Firebase: ${firebaseConfig.projectId}`}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 cursor-pointer hover:bg-amber-100 transition"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      firestoreConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span className="hidden sm:inline font-mono text-[10px]">
                    {firebaseConfig.projectId}
                  </span>
                </button>
              </div>
              {user.role === 'admin' && allHomes.length > 1 ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Building className="w-3.5 h-3.5 text-emerald-500" />
                  <select
                    value={home.id}
                    onChange={(e) => {
                      const selected = allHomes.find((h) => h.id === e.target.value);
                      if (selected) {
                        setHome(selected);
                        setHomeNameInput(selected.name);
                        setCutoffTimeInput(selected.cutoffTime);
                      }
                    }}
                    className={`text-xs font-bold py-0.5 px-2 rounded-lg border focus:outline-hidden cursor-pointer ${
                      isNight
                        ? 'bg-slate-900 border-slate-700 text-emerald-300'
                        : 'bg-white border-slate-300 text-emerald-800'
                    }`}
                  >
                    {allHomes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.cutoffTime})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400">Cutoff: {home.cutoffTime} SAST</span>
                </div>
              ) : (
                <p className={`text-xs font-medium flex items-center gap-1 ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Building className="w-3 h-3 text-slate-400" />
                  <span>{home.name}</span>
                  <span className="text-slate-300">•</span>
                  <span>Cutoff: {home.cutoffTime} SAST</span>
                </p>
              )}
            </div>
          </div>

          {/* Quick Actions & Navigation Controls */}
          <div className="flex items-center gap-2">
            {/* Dark Theme Switcher Icon */}
            <ThemeToggle />

            {/* Audio Alert Toggle */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playEmergencyAlertSound();
              }}
              title={soundEnabled ? 'Emergency siren audio enabled' : 'Emergency siren audio muted'}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                soundEnabled
                  ? isNight
                    ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : isNight
                  ? 'border-slate-800 bg-slate-800 text-slate-400'
                  : 'border-slate-200 bg-slate-100 text-slate-500'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden md:inline">{soundEnabled ? 'Audio On' : 'Muted'}</span>
            </button>

            {/* Architecture Justification Modal Button */}
            <button
              onClick={() => setIsEvaluationModalOpen(true)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isNight
                  ? 'border-slate-800 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Backend & Cost ADR</span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Switch to Resident Screen */}
            <button
              onClick={onNavigateToResidentScreen}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Resident View</span>
            </button>

            {/* User & Logout */}
            <div className={`h-6 w-px mx-1 hidden sm:block ${isNight ? 'bg-slate-800' : 'bg-slate-200'}`} />
            <div className="hidden lg:flex flex-col text-right">
              <span className={`text-xs font-bold ${isNight ? 'text-slate-200' : 'text-slate-800'}`}>{user.name}</span>
              <span className="text-[10px] text-slate-400 capitalize">{user.role}</span>
            </div>

            <button
              onClick={onLogout}
              title="Sign Out"
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isNight
                  ? 'border-slate-800 hover:bg-rose-950/60 hover:border-rose-800 text-slate-400 hover:text-rose-400'
                  : 'border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600'
              }`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRIMARY TAB NAVIGATION */}
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 border-t overflow-x-auto ${
            isNight ? 'border-slate-800' : 'border-slate-100'
          }`}
        >
          {/* Admin-Only Enterprise Overview Tab */}
          {user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-purple-500 text-purple-400 font-extrabold'
                  : isNight
                  ? 'border-transparent text-slate-400 hover:text-slate-200'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Shield className="w-4 h-4 text-purple-400" />
              <span>All Homes & Staff Overview</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'dashboard'
                ? isNight
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-emerald-600 text-emerald-700'
                : isNight
                ? 'border-transparent text-slate-400 hover:text-slate-200'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Status Dashboard</span>
            {stats.notOk > 0 && (
              <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full animate-pulse">
                {stats.notOk}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('residents')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'residents'
                ? isNight
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-emerald-600 text-emerald-700'
                : isNight
                ? 'border-transparent text-slate-400 hover:text-slate-200'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Resident Management</span>
            <span
              className={`text-[10px] px-2 py-0.2 rounded-full font-mono ${
                isNight ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {stats.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('linking')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'linking'
                ? isNight
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-emerald-600 text-emerald-700'
                : isNight
                ? 'border-transparent text-slate-400 hover:text-slate-200'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Device Pairing</span>
            <span
              className={`text-[10px] px-2 py-0.2 rounded-full font-mono ${
                isNight ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {stats.linked}/{stats.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              activeTab === 'settings'
                ? isNight
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-emerald-600 text-emerald-700'
                : isNight
                ? 'border-transparent text-slate-400 hover:text-slate-200'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Home Settings & Daily Cycle</span>
          </button>
        </div>
      </header>

      {/* TAB CONTENT CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* =================================================================== */}
        {/* 0. ENTERPRISE ADMIN OVERVIEW TAB (Visible to admin role) */}
        {/* =================================================================== */}
        {activeTab === 'overview' && user.role === 'admin' && (
          <AdminOverviewView
            token={token}
            onSelectHome={(selectedHome) => {
              setHome(selectedHome);
              setActiveTab('dashboard');
            }}
            activeHomeId={home.id}
          />
        )}
        {/* =================================================================== */}
        {/* 1. LIVE STATUS DASHBOARD TAB */}
        {/* =================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stat Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Emergency Alert Card (Red) */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'not_ok' ? 'all' : 'not_ok')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  stats.notOk > 0
                    ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                  <span>Emergency (No)</span>
                  <AlertTriangle className={`w-4 h-4 ${stats.notOk > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-400'}`} />
                </div>
                <div className={`text-3xl font-black mt-2 ${stats.notOk > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                  {stats.notOk}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {stats.notOk > 0 ? 'Urgent attention required' : 'No emergency alerts'}
                </p>
              </button>

              {/* No Response / Missed Cutoff Card (Amber) */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'no_response' ? 'all' : 'no_response')}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-left hover:border-amber-400 transition cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                  <span>Missed Cutoff</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-3xl font-black mt-2 text-amber-600">
                  {stats.noResponse}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  No response by {home.cutoffTime} SAST
                </p>
              </button>

              {/* Awaiting Checkin Card (Grey) */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'awaiting' ? 'all' : 'awaiting')}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-left hover:border-slate-400 transition cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                  <span>Awaiting Check-in</span>
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-3xl font-black mt-2 text-slate-700">
                  {stats.awaiting}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pending resident tap
                </p>
              </button>

              {/* Checked in OK Card (Green) */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'ok' ? 'all' : 'ok')}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs text-left hover:border-emerald-400 transition cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                  <span>Checked In OK</span>
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-black mt-2 text-emerald-600">
                  {stats.ok}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Confirmed safe today
                </p>
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search resident by name or room (e.g. 104, Arthur)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({residents.length})
                </button>
                <button
                  onClick={() => setStatusFilter('not_ok')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    statusFilter === 'not_ok'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  Red "No" ({stats.notOk})
                </button>
                <button
                  onClick={() => setStatusFilter('no_response')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    statusFilter === 'no_response'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Missed ({stats.noResponse})
                </button>
                <button
                  onClick={() => setStatusFilter('awaiting')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    statusFilter === 'awaiting'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Awaiting ({stats.awaiting})
                </button>
                <button
                  onClick={() => setStatusFilter('ok')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    statusFilter === 'ok'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  Green "Yes" ({stats.ok})
                </button>
              </div>
            </div>

            {/* Live Triage Residents Grid (WORST-FIRST ORDER) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2">
                  <span>Resident Status Triage</span>
                  <span className="text-xs font-normal text-slate-400">
                    (Sorted worst-first: Red alerts at top, green safe at bottom)
                  </span>
                </h3>
                <span className="text-xs text-slate-400">
                  Showing {sortedAndFilteredResidents.length} residents
                </span>
              </div>

              {loading ? (
                <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading resident wellness records...</p>
                </div>
              ) : sortedAndFilteredResidents.length === 0 ? (
                <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs">
                  No residents match the active filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {sortedAndFilteredResidents.map((resident) => {
                    const isNotOk = resident.todayStatus === 'not_ok';
                    const isNoResponse = resident.todayStatus === 'no_response';
                    const isAwaiting = resident.todayStatus === 'awaiting';
                    const isOk = resident.todayStatus === 'ok';

                    return (
                      <div
                        key={resident.id}
                        onClick={() => setSelectedResidentForDetail(resident)}
                        className={`rounded-2xl p-4 sm:p-5 border transition-all cursor-pointer relative group ${
                          isNotOk
                            ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-500 shadow-md hover:bg-rose-50'
                            : isNoResponse
                            ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400 shadow-xs'
                            : isAwaiting
                            ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                            : 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300 shadow-xs'
                        }`}
                      >
                        {/* Top card bar */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${
                                isNotOk
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : isNoResponse
                                  ? 'bg-amber-600 text-white'
                                  : isAwaiting
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              ROOM {resident.roomNumber}
                            </span>

                            {resident.isDeviceLinked ? (
                              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                <Smartphone className="w-3 h-3 text-emerald-600" />
                                Linked
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 bg-amber-100/80 px-2 py-0.5 rounded-full">
                                Not Linked
                              </span>
                            )}
                          </div>

                          {/* Status Pill */}
                          <div>
                            {isNotOk && (
                              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                NEED HELP
                              </span>
                            )}
                            {isNoResponse && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                                <Clock className="w-3 h-3" />
                                NO RESPONSE
                              </span>
                            )}
                            {isAwaiting && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                                <HelpCircle className="w-3 h-3" />
                                AWAITING
                              </span>
                            )}
                            {isOk && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                <CheckCircle className="w-3.5 h-3.5" />
                                OK
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Resident Name */}
                        <div className="mt-3">
                          <h4 className="font-bold text-base text-slate-900 leading-tight">
                            {resident.name}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {resident.phone || 'No phone recorded'}
                          </p>
                        </div>

                        {/* Check-in time / Notes */}
                        <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {resident.todayTimestamp
                              ? `At ${new Date(resident.todayTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} SAST`
                              : 'No check-in today'}
                          </span>
                          <span className="text-emerald-700 font-semibold group-hover:underline">
                            View Details →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. RESIDENT MANAGEMENT TAB */}
        {/* =================================================================== */}
        {activeTab === 'residents' && (
          <div className="space-y-4">
            {/* Header with Add Button */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Resident Directory</h2>
                <p className="text-xs text-slate-500">
                  Manage resident profiles, emergency contacts, and device-linking status for {home.name}.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>CSV Import</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={handleBatchLinkCodes}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Export Link Codes</span>
                </button>
                <button
                  onClick={() => {
                    setEditingResident(null);
                    setIsAddEditModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Resident</span>
                </button>
              </div>
            </div>

            {/* Residents Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100/80 uppercase text-[10px] font-bold text-slate-600 tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Room</th>
                      <th className="py-3 px-4">Resident Name</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Link Code</th>
                      <th className="py-3 px-4">Device Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {residents.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {r.roomNumber}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {r.name}
                          {r.emergencyContact && (
                            <div className="text-[10px] text-slate-400 font-normal">EC: {r.emergencyContact}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {r.phone || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {r.oneTimeLinkCode || (r.isDeviceLinked ? 'Paired' : '—')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {r.isDeviceLinked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3 text-emerald-600" /> Linked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                              Unlinked
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1">
                          <button
                            onClick={() => setSelectedResidentForQR(r)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                            title="Pair Device"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRegenerateLinkCode(r.id, r.roomNumber, r.name)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 text-amber-600 transition cursor-pointer"
                            title="Regenerate Link Code"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingResident(r);
                              setIsAddEditModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteResident(r.id, r.name)}
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. DEVICE PAIRING TAB */}
        {/* =================================================================== */}
        {activeTab === 'linking' && (
          <div className="space-y-5">
            {/* Explanatory Banner */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-md space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Smartphone className="w-4 h-4" />
                <span>Resident Device Pairing</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black">ElderWatch Device Setup</h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                Staff visit the resident, open the pairing URL on the resident's phone, enter the pairing code, and tap "Lock This Phone to Resident". The browser permanently stores that resident's identity, locking the screen to the high-contrast Yes/No check-in.
              </p>
            </div>

            {/* Onboarding Progress Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Onboarding Rollout Progress</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  {stats.linked} of {stats.total} phones paired ({Math.round((stats.linked / (stats.total || 1)) * 100)}%)
                </h3>
              </div>
              <div className="w-full sm:w-64 h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${(stats.linked / (stats.total || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Residents Ready for Pairing */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-slate-800">
                Select a Resident to View / Generate Pairing Code
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {residents.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3 hover:border-emerald-500 transition"
                  >
                    <div>
                      <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        ROOM {r.roomNumber}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 mt-1">{r.name}</h4>
                      <p className="text-[11px] text-slate-500">
                        {r.isDeviceLinked ? 'Paired & Active' : 'Not yet paired'}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedResidentForQR(r)}
                      className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Pair Device</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 4. HOME SETTINGS & DAILY CYCLE SCHEDULER TAB */}
        {/* =================================================================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Multi-Tenant Facility Details Form */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">Facility Configuration</h3>
              </div>

              {settingsSuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{settingsSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings} className="space-y-4 max-w-xl text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Care Home Name
                  </label>
                  <input
                    type="text"
                    value={homeNameInput}
                    onChange={(e) => setHomeNameInput(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Daily Check-in Cutoff Time (SAST)
                    </label>
                    <input
                      type="time"
                      value={cutoffTimeInput}
                      onChange={(e) => setCutoffTimeInput(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Unanswered residents auto-marked "no_response" at this cutoff.
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Timezone
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Africa/Johannesburg (SAST, UTC+2)"
                      className="w-full p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </form>
            </div>

            {/* Daily Cycle Test Engine (Interactive Triggers) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900">Daily Cycle Scheduled Jobs</h3>
                </div>
                <span className="text-xs bg-slate-100 font-mono font-bold text-slate-600 px-3 py-1 rounded-full">
                  Automated Interval: Every 30s
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                The ElderWatch engine checks the system clock and fires automated cron routines at <strong>07:00 SAST</strong> (Morning Reset), <strong>08:45 SAST</strong> (Reminder Push), and <strong>{home.cutoffTime} SAST</strong> (Cutoff Sweep). Use the manual trigger buttons below to test transitions immediately:
              </p>

              {jobFeedbackMsg && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>{jobFeedbackMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {/* 07:00 Morning Reset */}
                <button
                  onClick={() => handleTriggerJob('/api/jobs/trigger-morning-reset', 'Morning Reset')}
                  disabled={!!runningJob}
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-1">
                    07:00 SAST
                  </span>
                  <span className="font-bold text-slate-900 text-sm block">
                    Morning Reset
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Resets all residents to "awaiting" & sends morning check-in prompt.
                  </span>
                </button>

                {/* 08:45 Reminder */}
                <button
                  onClick={() => handleTriggerJob('/api/jobs/trigger-reminder-push', 'Reminder Push')}
                  disabled={!!runningJob}
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-blue-700 uppercase block mb-1">
                    08:45 SAST
                  </span>
                  <span className="font-bold text-slate-900 text-sm block">
                    Dispatch Reminders
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Sends push notification nudging anyone still "awaiting".
                  </span>
                </button>

                {/* Cutoff Sweep */}
                <button
                  onClick={() => handleTriggerJob('/api/jobs/trigger-cutoff-sweep', 'Cutoff Sweep')}
                  disabled={!!runningJob}
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left transition cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-amber-700 uppercase block mb-1">
                    {home.cutoffTime} SAST Cutoff
                  </span>
                  <span className="font-bold text-slate-900 text-sm block">
                    Run Cutoff Sweep
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Transitions all remaining "awaiting" residents to "no_response".
                  </span>
                </button>

                {/* Emergency Alert Simulation */}
                <button
                  onClick={() => handleTriggerJob('/api/jobs/simulate-emergency', 'Emergency Alert')}
                  disabled={!!runningJob}
                  className="p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left transition cursor-pointer"
                >
                  <span className="text-[11px] font-bold text-rose-700 uppercase block mb-1">
                    Immediate Trigger
                  </span>
                  <span className="font-bold text-rose-950 text-sm block">
                    Simulate "No" Tap
                  </span>
                  <span className="text-[11px] text-rose-800 block mt-1">
                    Simulates a resident pressing RED "I need help" to test alarms.
                  </span>
                </button>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Recent Scheduled Job & Push Notification Logs</span>
              </h3>

              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
                {jobLogs.length === 0 ? (
                  <p className="p-4 text-slate-400 text-center">No execution logs yet.</p>
                ) : (
                  jobLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="p-3.5 flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-800 block">{log.description}</span>
                        {log.details && (
                          <span className="text-slate-500 text-[11px] block mt-0.5">{log.details}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} SAST
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODALS */}
      {selectedResidentForDetail && (
        <ResidentDetailModal
          resident={selectedResidentForDetail}
          token={token}
          onClose={() => setSelectedResidentForDetail(null)}
          onOpenQR={(r) => {
            setSelectedResidentForDetail(null);
            setSelectedResidentForQR(r);
          }}
          onStatusUpdated={() => {
            fetchResidents();
            fetchLogs();
          }}
        />
      )}

      {selectedResidentForQR && (
        <DeviceLinkQRModal
          resident={selectedResidentForQR}
          token={token}
          onClose={() => setSelectedResidentForQR(null)}
          onCodeRegenerated={fetchResidents}
          onSimulateDeviceBind={(code) => {
            setSelectedResidentForQR(null);
            onSimulateDeviceBind(code);
          }}
        />
      )}

      {isAddEditModalOpen && (
        <AddEditResidentModal
          resident={editingResident}
          onClose={() => setIsAddEditModalOpen(false)}
          onSave={handleSaveResident}
        />
      )}

      {isEvaluationModalOpen && (
        <BackendEvaluationModal onClose={() => setIsEvaluationModalOpen(false)} />
      )}
    </div>
  );
};
