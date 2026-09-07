import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, QrCode, Smartphone, RefreshCw } from 'lucide-react';
import { ResidentTodayView } from '../types';
import { QRCodeDisplay } from './QRCodeDisplay';

interface DeviceLinkQRModalProps {
  resident: ResidentTodayView;
  token: string;
  onClose: () => void;
  onCodeRegenerated: () => void;
  onSimulateDeviceBind: (code: string) => void;
}

export const DeviceLinkQRModal: React.FC<DeviceLinkQRModalProps> = ({
  resident,
  token,
  onClose,
  onCodeRegenerated,
  onSimulateDeviceBind,
}) => {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [currentCode, setCurrentCode] = useState(resident.oneTimeLinkCode || '');

  // Calculate full setup URL
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const setupUrl = `${origin}/link?code=${encodeURIComponent(currentCode || 'SETUP')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(setupUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerateCode = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/residents/${resident.id}/link-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentCode(data.linkCode);
        onCodeRegenerated();
      }
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
            <h3 className="font-bold text-lg mt-1">Setup Phone for {resident.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-4">
          <p className="text-xs text-slate-600">
            Open the resident's phone camera and scan the QR code below, or send them the setup link.
          </p>

          {/* QR Code */}
          <div className="flex justify-center my-2">
            <QRCodeDisplay url={setupUrl} size={200} />
          </div>

          {/* Setup Code Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">One-Time Pairing Code</p>
            <p className="font-mono text-xl font-black text-slate-800 tracking-wider mt-0.5">
              {currentCode || 'GENERATING...'}
            </p>
          </div>

          {/* Setup Link Input & Copy */}
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={setupUrl}
              className="flex-1 text-xs px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 select-all font-mono truncate"
            />
            <button
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          {/* Testing Action for Reviewers */}
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
