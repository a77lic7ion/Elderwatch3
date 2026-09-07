import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Link2, Smartphone, RefreshCw, QrCode } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [currentCode, setCurrentCode] = useState(resident.oneTimeLinkCode || '');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const setupUrl = `${origin}/link?code=${encodeURIComponent(currentCode || 'SETUP')}`;
  const permanentUrl = `${origin}/checkin/${resident.id}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(setupUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyPermanentUrl = () => {
    navigator.clipboard.writeText(permanentUrl);
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
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
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
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              How to pair this resident's phone:
            </p>
            <ol className="text-[11px] text-blue-700 space-y-1 list-decimal list-inside">
              <li>Open the resident's phone browser</li>
              <li>Type in the pairing URL below (or tap the link)</li>
              <li>Enter the pairing code when prompted</li>
              <li>Tap "Lock This Phone to Resident"</li>
            </ol>
          </div>

          {/* Pairing Code */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pairing Code</p>
            <p className="font-mono text-2xl font-black text-slate-800 tracking-wider mt-1 select-all">
              {currentCode || 'GENERATING...'}
            </p>
            <button
              onClick={handleCopyCode}
              className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 mx-auto cursor-pointer"
            >
              {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedCode ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* Pairing URL */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Pairing URL</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={setupUrl}
                className="flex-1 text-[11px] px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 select-all font-mono truncate"
              />
              <button
                onClick={handleCopyUrl}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Permanent Check-in URL (after linking) */}
          {resident.isDeviceLinked && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Permanent Check-in URL (save to home screen)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={permanentUrl}
                  className="flex-1 text-[11px] px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-800 select-all font-mono truncate"
                />
                <button
                  onClick={handleCopyPermanentUrl}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              onClick={() => onSimulateDeviceBind(currentCode)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Simulate: Bind Resident Phone on This Browser</span>
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
