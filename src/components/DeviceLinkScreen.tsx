import React, { useState, useEffect } from 'react';
import { Smartphone, CheckCircle, Shield, AlertCircle, ArrowRight, Home } from 'lucide-react';
import { DeviceBinding } from '../types';

interface DeviceLinkScreenProps {
  initialCode?: string;
  onLinkedSuccess: (binding: DeviceBinding) => void;
  onCancel?: () => void;
}

interface VerifyResult {
  valid: boolean;
  resident: {
    id: string;
    name: string;
    roomNumber: string;
    homeId: string;
  };
  home: {
    id: string;
    name: string;
  } | null;
}

export const DeviceLinkScreen: React.FC<DeviceLinkScreenProps> = ({
  initialCode,
  onLinkedSuccess,
  onCancel,
}) => {
  const [code, setCode] = useState(initialCode || '');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bindingInProgress, setBindingInProgress] = useState(false);

  // Auto-verify if code passed in URL
  useEffect(() => {
    if (initialCode) {
      handleVerify(initialCode);
    }
  }, [initialCode]);

  const handleVerify = async (targetCode: string) => {
    if (!targetCode.trim()) return;
    setVerifying(true);
    setError(null);
    setVerifyResult(null);

    try {
      const res = await fetch(`/api/link/verify?code=${encodeURIComponent(targetCode.trim())}`);
      const data = await res.json();

      if (!res.ok || !data.valid) {
        setError(data.error || 'Invalid or expired setup code.');
      } else {
        setVerifyResult(data);
      }
    } catch {
      setError('Network error verifying device setup code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleConfirmBind = async () => {
    if (!verifyResult) return;
    setBindingInProgress(true);
    setError(null);

    try {
      const res = await fetch('/api/link/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to bind device.');
        setBindingInProgress(false);
        return;
      }

      // Store permanently in device's localStorage
      localStorage.setItem('elderwatch_device_binding', JSON.stringify(data.binding));

      // Invoke success handler to redirect to /checkin
      onLinkedSuccess(data.binding);
    } catch {
      setError('Failed to bind device due to a connection issue.');
      setBindingInProgress(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white flex flex-col justify-between p-6 sm:p-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
            EW
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Device Pairing</h1>
            <p className="text-xs text-slate-400">ElderWatch Resident Setup</p>
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="max-w-md mx-auto my-auto w-full space-y-6">
        {!verifyResult ? (
          <div className="bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <Smartphone className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-white">Setup Resident Phone</h2>
              <p className="text-sm text-slate-300">
                Enter the one-time code or scan the QR code displayed in the Staff Admin Panel.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Setup Code
              </label>
              <input
                type="text"
                placeholder="e.g. LINK-201-GEO"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full uppercase font-mono tracking-widest text-center text-xl py-3.5 px-4 rounded-xl bg-slate-900 border border-slate-600 focus:border-emerald-500 focus:outline-hidden text-white placeholder:text-slate-600 font-bold"
              />

              {error && (
                <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 p-3 rounded-xl border border-rose-800/60">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleVerify(code)}
                disabled={verifying || !code.trim()}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold text-white shadow-lg transition cursor-pointer"
              >
                {verifying ? 'Verifying Code...' : 'Verify Resident'}
              </button>
            </div>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-white">Confirm Resident Binding</h2>
              <p className="text-sm text-slate-300">
                This phone will be locked to this resident for daily morning check-ins.
              </p>
            </div>

            <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-700 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Resident Name</span>
                <span className="text-base font-bold text-white">{verifyResult.resident.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Room Number</span>
                <span className="text-base font-bold text-emerald-400">Room {verifyResult.resident.roomNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Care Facility</span>
                <span className="text-xs font-semibold text-slate-300 text-right max-w-[200px] truncate">
                  {verifyResult.home?.name || 'Care Sanctuary'}
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-950/40 p-3 rounded-xl border border-rose-800/60">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              id="btn-confirm-device-bind"
              onClick={handleConfirmBind}
              disabled={bindingInProgress}
              className="w-full py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 font-bold text-white text-base shadow-xl shadow-emerald-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{bindingInProgress ? 'Binding Device...' : 'Lock This Phone to Resident'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Shield className="w-4 h-4 text-emerald-500" />
        <span>One-Time Permanent Hardware Association</span>
      </div>
    </div>
  );
};
