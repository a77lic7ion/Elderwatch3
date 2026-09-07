import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Link2, Smartphone, RefreshCw } from 'lucide-react';
import { ResidentTodayView } from '../types';

interface DeviceLinkQRModalProps {
  resident: ResidentTodayView;
  onClose: () => void;
  onCodeRegenerated: () => void;
  onSimulateDeviceBind: (code: string) => void;
}

export const DeviceLinkQRModal: React.FC<DeviceLinkQRModalProps> = ({
  resident,
  onClose,
  onCodeRegenerated,
  onSimulateDeviceBind,
}) => {
  const [copiedPermanent, setCopiedPermanent] = useState(false);
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [currentCode, setCurrentCode] = useState(resident.oneTimeLinkCode || '');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const permanentUrl = `${origin}/checkin/${resident.id}`;
  const setupUrl = `${origin}/link?code=${encodeURIComponent(currentCode || 'SETUP')}`;

  const handleCopyPermanentUrl = () => {
    navigator.clipboard.writeText(permanentUrl);
    setCopiedPermanent(true);
    setTimeout(() => setCopiedPermanent(false), 2500);
  };

  const handleCopySetupUrl = () => {
    navigator.clipboard.writeText(setupUrl);
    setCopiedSetup(true);
    setTimeout(() => setCopiedSetup(false), 2500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleRegenerateCode = async () => {
    setRegenerating(true);
    try {
      const { regenerateLinkCode } = await import('../lib/firebase-api');
      const newCode = await regenerateLinkCode(resident.id, resident.roomNumber);
      setCurrentCode(newCode);
      onCodeRegenerated();
    } catch (err) {
      console.error('Failed to regenerate code:', err);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-900 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
          <div>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ROOM {resident.roomNumber}
            </span>
            <h3 className="font-bold text-lg mt-1">Pair Device for {resident.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          
          {/* STEP 1: PERMANENT URL - Most important! */}
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
              <Link2 className="w-4 h-4" />
              1. SAVE THIS URL TO THE PHONE
            </p>
            <p className="text-xs text-emerald-700">
              Open this URL on the resident's phone, then tap "Add to Home Screen" to create an app icon.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={permanentUrl}
                className="flex-1 text-sm px-3 py-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-800 select-all font-mono"
              />
              <button
                onClick={handleCopyPermanentUrl}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {copiedPermanent ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPermanent ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* STEP 2: Pairing Code */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              2. ENTER THIS CODE ON THE PHONE
            </p>
            <p className="text-xs text-slate-600">
              After opening the URL above, the phone will ask for this code to complete pairing.
            </p>
            <div className="text-center">
              <p className="font-mono text-3xl font-black text-slate-800 tracking-wider select-all">
                {currentCode || 'GENERATING...'}
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 mx-auto cursor-pointer"
            >
              {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedCode ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* STEP 3: Alternative pairing URL */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              Alternative: Send this link via WhatsApp/SMS
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={setupUrl}
                className="flex-1 text-[11px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 select-all font-mono truncate"
              />
              <button
                onClick={handleCopySetupUrl}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {copiedSetup ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              onClick={() => onSimulateDeviceBind(currentCode)}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Test: Open Resident View in This Browser</span>
            </button>

            <button
              onClick={handleRegenerateCode}
              disabled={regenerating}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 mx-auto pt-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
              <span>Regenerate New Code</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
