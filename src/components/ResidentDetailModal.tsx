import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertTriangle, Clock, HelpCircle, QrCode, Phone, User, Calendar, ShieldAlert } from 'lucide-react';
import { ResidentTodayView, CheckIn } from '../types';

interface ResidentDetailModalProps {
  resident: ResidentTodayView;
  token: string;
  onClose: () => void;
  onOpenQR: (resident: ResidentTodayView) => void;
  onStatusUpdated: () => void;
}

export const ResidentDetailModal: React.FC<ResidentDetailModalProps> = ({
  resident,
  token,
  onClose,
  onOpenQR,
  onStatusUpdated,
}) => {
  const [history, setHistory] = useState<CheckIn[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideNotes, setOverrideNotes] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/residents/${resident.id}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || []);
        }
      } catch (err) {
        console.error('Failed to fetch resident history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [resident.id, token]);

  const handleOverrideStatus = async (newStatus: 'ok' | 'not_ok' | 'awaiting') => {
    setOverrideLoading(true);
    try {
      const res = await fetch('/api/checkins/staff-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          residentId: resident.id,
          status: newStatus,
          notes: overrideNotes || `Staff manual check-in: ${newStatus.toUpperCase()}`,
        }),
      });

      if (res.ok) {
        onStatusUpdated();
        setShowOverrideForm(false);
      }
    } catch (err) {
      console.error('Staff override failed:', err);
    } finally {
      setOverrideLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'not_ok':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Needs Attention (Red "No")
          </span>
        );
      case 'no_response':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            No Response (Missed Cutoff)
          </span>
        );
      case 'awaiting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Awaiting Check-in
          </span>
        );
      case 'ok':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Checked In OK (Green "Yes")
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-xs px-2 py-0.5 rounded-md border border-emerald-500/30">
                ROOM {resident.roomNumber}
              </span>
              {resident.isDeviceLinked ? (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  ● Device Linked
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                  ○ Device Unlinked
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold">{resident.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Today's Triage Status Card */}
          <div
            className={`p-4 rounded-2xl border ${
              resident.todayStatus === 'not_ok'
                ? 'bg-rose-50 border-rose-300'
                : resident.todayStatus === 'no_response'
                ? 'bg-amber-50 border-amber-300'
                : resident.todayStatus === 'awaiting'
                ? 'bg-slate-50 border-slate-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Today's Wellness Status
              </span>
              {getStatusBadge(resident.todayStatus)}
            </div>

            <div className="text-xs text-slate-600 space-y-1 pt-1">
              {resident.todayTimestamp ? (
                <p>
                  Logged at: <strong>{new Date(resident.todayTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} SAST</strong> ({resident.todayUpdatedBy === 'resident' ? 'Tapped by resident' : resident.todayUpdatedBy})
                </p>
              ) : (
                <p>No check-in received yet today.</p>
              )}
            </div>

            {/* Quick Action Button */}
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between">
              <button
                onClick={() => setShowOverrideForm(!showOverrideForm)}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
              >
                {showOverrideForm ? 'Hide Staff Override' : 'Staff Override / In-Person Visit'}
              </button>
              <button
                onClick={() => onOpenQR(resident)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Pairing QR</span>
              </button>
            </div>

            {/* In-Person Staff Override Form */}
            {showOverrideForm && (
              <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
                <p className="text-xs font-bold text-slate-800">
                  Update status following nurse room inspection:
                </p>
                <input
                  type="text"
                  placeholder="Notes (e.g. Sister visited room, resident safe and having tea)"
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOverrideStatus('ok')}
                    disabled={overrideLoading}
                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700"
                  >
                    Mark OK
                  </button>
                  <button
                    onClick={() => handleOverrideStatus('not_ok')}
                    disabled={overrideLoading}
                    className="flex-1 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700"
                  >
                    Mark Alert
                  </button>
                  <button
                    onClick={() => handleOverrideStatus('awaiting')}
                    disabled={overrideLoading}
                    className="flex-1 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Resident Details */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">Resident Information</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Phone Number</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {resident.phone || 'None registered'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Emergency Contact</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  {resident.emergencyContact || 'None on file'}
                </span>
              </div>
            </div>
            {resident.notes && (
              <div className="pt-2 border-t border-slate-200 text-xs">
                <span className="text-slate-400 block">Care & Mobility Notes</span>
                <p className="text-slate-700 mt-0.5 leading-relaxed">{resident.notes}</p>
              </div>
            )}
          </div>

          {/* 7-Day Check-in History */}
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Recent Check-in History</span>
            </h4>

            {loadingHistory ? (
              <p className="text-xs text-slate-400">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No previous check-in records found.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden text-xs">
                {history.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">{item.date}</span>
                      <p className="text-[11px] text-slate-400">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} SAST
                      </p>
                    </div>
                    <div>{getStatusBadge(item.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => onOpenQR(resident)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 transition"
          >
            <QrCode className="w-4 h-4" />
            <span>Generate Phone Setup QR</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
