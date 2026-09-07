import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceBinding } from '../types';
import { saveCheckinToFirestore } from '../lib/firebase';

interface ResidentCheckInScreenProps {
  onNavigateToAdmin?: () => void;
  onNavigateToLink?: (code?: string) => void;
  permanentResidentId?: string | null;
}

type ViewState = 'morning' | 'ok' | 'help' | 'linked' | 'lang_select';
type LangCode = 'en' | 'af';

interface ResidentProfile {
  name: string;
  room: string;
  wing: string;
  sister: string;
  sisterInitials: string;
  phone: string;
}

const DEFAULT_RESIDENT: ResidentProfile = {
  name: 'Resident',
  room: 'Room --',
  wing: 'Care Home',
  sister: 'Sister',
  sisterInitials: 'SS',
  phone: '',
};

const CUTOFF_TIME = '9:15';

const T = {
  en: {
    hello: (h: number) => (h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,'),
    where: (r: ResidentProfile) => `${r.room}, ${r.wing}`,
    okLabel: "I'm OK",
    okSub: "Tap once. The sisters will know you're up.",
    helpLabel: 'I need help',
    helpSub: 'A sister will come to your room.',
    okTitle: (name: string) => `Thank you, ${name}.`,
    okBody: "The sisters know you're up. Have a lovely day.",
    okTime: (t: string) => `Checked in at ${t}`,
    undo: 'Tapped by mistake? Undo',
    helpTitle: 'Help is on its way.',
    helpBody: (sister: string) => `Sister ${sister} has been told. Please stay where you are.`,
    helpTime: (t: string) => `Sent at ${t}`,
    cancel: "I'm fine after all",
    call: (sister: string) => `Call Sister ${sister}`,
    callSub: 'On duty this morning',
    late: `It's after ${CUTOFF_TIME}. Please tap I'm OK, or a sister will pop in to check on you.`,
    linkedTitle: (name: string) => `This phone is now yours, ${name}.`,
    linkedBody: "Every morning, open it and tap the green button. That's all.",
    go: 'Continue',
    langTitle: 'Choose your language',
    langSub: 'Kies jou taal',
    locale: 'en-ZA',
  },
  af: {
    hello: (h: number) => (h < 12 ? 'Goeie môre,' : h < 17 ? 'Goeie middag,' : 'Goeienaand,'),
    where: (r: ResidentProfile) => `${r.room.replace('Room', 'Kamer')}, ${r.wing}`,
    okLabel: 'Ek is reg',
    okSub: 'Tik een keer. Die susters sal weet jy is op.',
    helpLabel: 'Ek het hulp nodig',
    helpSub: "'n Suster sal na jou kamer kom.",
    okTitle: (name: string) => `Dankie, ${name}.`,
    okBody: 'Die susters weet jy is op. Geniet jou dag.',
    okTime: (t: string) => `Ingeteken om ${t}`,
    undo: 'Per ongeluk getik? Herstel',
    helpTitle: 'Hulp is oppad.',
    helpBody: (sister: string) => `Suster ${sister} is in kennis gestel. Bly asseblief waar jy is.`,
    helpTime: (t: string) => `Gestuur om ${t}`,
    cancel: 'Ek is tog reg',
    call: (sister: string) => `Bel Suster ${sister}`,
    callSub: 'Vanoggend aan diens',
    late: `Dit is na ${CUTOFF_TIME}. Tik asseblief Ek is reg, anders kom 'n suster kyk hoe dit gaan.`,
    linkedTitle: (name: string) => `Hierdie foon is nou joune, ${name}.`,
    linkedBody: 'Maak dit elke oggend oop en tik die groen knoppie. Dis al.',
    go: 'Gaan voort',
    langTitle: 'Kies jou taal',
    langSub: 'Choose your language',
    locale: 'af-ZA',
  },
};

function pad(n: number) {
  return (n < 10 ? '0' : '') + n;
}

function formatHHMM(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ResidentCheckInScreen: React.FC<ResidentCheckInScreenProps> = ({
  onNavigateToAdmin,
  onNavigateToLink,
  permanentResidentId,
}) => {
  const [deviceBinding, setDeviceBinding] = useState<DeviceBinding | null>(null);
  const [residentProfile, setResidentProfile] = useState<ResidentProfile>(DEFAULT_RESIDENT);
  const [view, setView] = useState<ViewState>('morning');
  const [lang, setLang] = useState<LangCode>(() => {
    try {
      const saved = localStorage.getItem('ew_lang');
      if (saved === 'af' || saved === 'en') return saved;
    } catch {}
    return 'en';
  });
  const [isLate, setIsLate] = useState(false);
  const [checkInTime, setCheckInTime] = useState<Date | null>(null);
  const [helpTime, setHelpTime] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flashKind, setFlashKind] = useState<'ok' | 'help' | null>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  const playTone = useCallback((good: boolean) => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.type = 'sine';
      if (good) {
        o.frequency.setValueAtTime(523, ac.currentTime);
        o.frequency.setValueAtTime(784, ac.currentTime + 0.18);
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.7);
        o.start();
        o.stop(ac.currentTime + 0.72);
      } else {
        o.frequency.setValueAtTime(440, ac.currentTime);
        o.frequency.setValueAtTime(330, ac.currentTime + 0.25);
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.22, ac.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
        o.start();
        o.stop(ac.currentTime + 0.92);
      }
    } catch {}
  }, []);

  const buzz = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    } catch {}
  }, []);

  const triggerFlash = useCallback((kind: 'ok' | 'help') => {
    setFlashKind(kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashKind(null), 1100);
  }, []);

  // Load device binding
  useEffect(() => {
    try {
      const saved = localStorage.getItem('elderwatch_device_binding');
      if (saved) {
        const parsed: DeviceBinding = JSON.parse(saved);
        setDeviceBinding(parsed);
        const nameParts = parsed.residentName.split(' ');
        const initials = nameParts.length > 1 ? `${nameParts[0][0]}${nameParts[1][0]}` : nameParts[0].substring(0, 2);
        setResidentProfile({
          name: parsed.residentName.split(' ')[0] || parsed.residentName,
          room: `Room ${parsed.roomNumber}`,
          wing: parsed.homeName || 'Care Home',
          sister: 'Sister',
          sisterInitials: initials.toUpperCase(),
          phone: '',
        });

        const todayStr = new Date().toISOString().split('T')[0];
        const existingCheckin = localStorage.getItem(`elderwatch_checkin_${parsed.residentId}_${todayStr}`);
        if (existingCheckin) {
          const pc = JSON.parse(existingCheckin);
          if (pc.status === 'ok') { setView('ok'); setCheckInTime(new Date(pc.timestamp)); }
          else if (pc.status === 'not_ok') { setView('help'); setHelpTime(new Date(pc.timestamp)); }
        }
      }
    } catch (e) {
      console.error('Error loading device state:', e);
    }
  }, []);

  // Auto-bind from permanent URL
  useEffect(() => {
    if (!permanentResidentId) return;
    const autoBind = async () => {
      try {
        const { db } = await import('../lib/firebase');
        const { doc, getDoc, setDoc } = await import('firebase/firestore');

        const residentDoc = await getDoc(doc(db, 'residents', permanentResidentId));
        if (!residentDoc.exists()) return;

        const rData = residentDoc.data();
        const homeDoc = await getDoc(doc(db, 'homes', rData.homeId));
        const homeName = homeDoc.exists() ? (homeDoc.data() as any).name : 'Care Home';

        const binding: DeviceBinding = {
          residentId: permanentResidentId,
          homeId: rData.homeId,
          residentName: rData.name,
          roomNumber: rData.roomNumber,
          homeName,
          linkedAt: new Date().toISOString(),
        };

        if (!rData.isDeviceLinked) {
          await setDoc(doc(db, 'residents', permanentResidentId), {
            isDeviceLinked: true, linkedAt: new Date().toISOString(), oneTimeLinkCode: null,
          }, { merge: true });
        }

        localStorage.setItem('elderwatch_device_binding', JSON.stringify(binding));
        setDeviceBinding(binding);

        const nameParts = binding.residentName.split(' ');
        const initials = nameParts.length > 1 ? `${nameParts[0][0]}${nameParts[1][0]}` : nameParts[0].substring(0, 2);
        setResidentProfile({
          name: binding.residentName.split(' ')[0] || binding.residentName,
          room: `Room ${binding.roomNumber}`,
          wing: homeName,
          sister: 'Sister',
          sisterInitials: initials.toUpperCase(),
          phone: '',
        });

        // Check if language is already set
        const savedLang = localStorage.getItem('ew_lang');
        if (savedLang === 'af' || savedLang === 'en') {
          setView('linked');
          setTimeout(() => setView('morning'), 2000);
        } else {
          setView('lang_select');
        }
      } catch (e) {
        console.error('Error auto-binding:', e);
      }
    };

    const existing = localStorage.getItem('elderwatch_device_binding');
    if (!existing || JSON.parse(existing).residentId !== permanentResidentId) {
      autoBind();
    } else {
      // Already bound, check language
      const savedLang = localStorage.getItem('ew_lang');
      if (!savedLang) setView('lang_select');
    }
  }, [permanentResidentId]);

  // Cutoff check
  useEffect(() => {
    const check = () => {
      const now = new Date();
      setIsLate(now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 15));
    };
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, []);

  const handleLangSelect = (newLang: LangCode) => {
    setLang(newLang);
    localStorage.setItem('ew_lang', newLang);
    if (deviceBinding) {
      setView('linked');
      setTimeout(() => setView('morning'), 2000);
    } else {
      setView('morning');
    }
  };

  const handleOkClick = async () => {
    if (submitting) return;
    const now = new Date();
    setCheckInTime(now);
    playTone(true);
    buzz(60);
    triggerFlash('ok');
    setView('ok');

    const resId = deviceBinding?.residentId || 'demo';
    const hId = deviceBinding?.homeId || 'demo';
    const todayStr = now.toISOString().split('T')[0];

    try {
      setSubmitting(true);
      localStorage.setItem(`elderwatch_checkin_${resId}_${todayStr}`, JSON.stringify({ status: 'ok', timestamp: now.toISOString() }));
      saveCheckinToFirestore(hId, resId, 'ok').catch(() => {});
      await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ residentId: resId, homeId: hId, status: 'ok' }) });
    } catch {} finally { setSubmitting(false); }
  };

  const handleHelpClick = async () => {
    if (submitting) return;
    const now = new Date();
    setHelpTime(now);
    playTone(false);
    buzz([120, 60, 120]);
    triggerFlash('help');
    setView('help');

    const resId = deviceBinding?.residentId || 'demo';
    const hId = deviceBinding?.homeId || 'demo';
    const todayStr = now.toISOString().split('T')[0];

    try {
      setSubmitting(true);
      localStorage.setItem(`elderwatch_checkin_${resId}_${todayStr}`, JSON.stringify({ status: 'not_ok', timestamp: now.toISOString() }));
      saveCheckinToFirestore(hId, resId, 'not_ok').catch(() => {});
      await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ residentId: resId, homeId: hId, status: 'not_ok' }) });
    } catch {} finally { setSubmitting(false); }
  };

  const handleUndo = async () => {
    setView('morning');
    setCheckInTime(null);
    setHelpTime(null);
    const resId = deviceBinding?.residentId || 'demo';
    const hId = deviceBinding?.homeId || 'demo';
    localStorage.removeItem(`elderwatch_checkin_${resId}_${new Date().toISOString().split('T')[0]}`);
    saveCheckinToFirestore(hId, resId, 'awaiting').catch(() => {});
    try { await fetch('/api/checkin/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ residentId: resId, homeId: hId }) }); } catch {}
  };

  const t = T[lang];
  const now = new Date();
  let dateText = '';
  try {
    const wd = new Intl.DateTimeFormat(t.locale, { weekday: 'long' }).format(now);
    const mo = new Intl.DateTimeFormat(t.locale, { month: 'long' }).format(now);
    dateText = `${wd} ${now.getDate()} ${mo}`;
  } catch { dateText = now.toDateString(); }

  // Language selection screen
  if (view === 'lang_select') {
    return (
      <div className="w-full h-screen h-[100dvh] flex flex-col items-center justify-center p-8" style={{ background: '#FAF7F2', fontFamily: '"Atkinson Hyperlegible", sans-serif' }}>
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">Choose your language</h1>
            <p className="text-lg text-slate-600">Kies jou taal</p>
          </div>
          <div className="space-y-3">
            <button onClick={() => handleLangSelect('en')} className="w-full py-5 rounded-2xl bg-slate-900 text-white text-2xl font-bold shadow-lg hover:bg-slate-800 transition cursor-pointer">
              English
            </button>
            <button onClick={() => handleLangSelect('af')} className="w-full py-5 rounded-2xl bg-white border-2 border-slate-200 text-slate-900 text-2xl font-bold shadow-sm hover:bg-slate-50 transition cursor-pointer">
              Afrikaans
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen h-[100dvh] overflow-hidden select-none" style={{ background: '#FAF7F2', fontFamily: '"Atkinson Hyperlegible", sans-serif' }}>
      <div className="app-inner" style={{ fontSize: 'calc(20px * var(--scale, 1))', lineHeight: 1.35, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: 'calc(58px * var(--scale, 1)) calc(22px * var(--scale, 1)) calc(20px * var(--scale, 1))', gap: 'calc(12px * var(--scale, 1))', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}>

        {/* Language switcher */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 'calc(44px * var(--scale, 1))', position: 'relative', zIndex: 2 }}>
          <span style={{ display: 'inline-flex', color: '#157A4C' }}>
            <svg viewBox="0 0 512 512" fill="none" style={{ width: 'calc(34px * var(--scale, 1))', height: 'calc(34px * var(--scale, 1))' }}>
              <path d="M256 36L48 214C37 223.4 43.6 242 58 242H88V434C88 456.09 105.91 474 128 474H384C406.09 474 424 456.09 424 434V242H454C468.4 242 475 223.4 464 214L256 36Z" fill="currentColor" />
              <path d="M256 405C256 405 120 324 120 236C120 188 158 152 204 152C232 152 248 166 256 177C264 166 280 152 308 152C354 152 392 188 392 236C392 324 256 405 256 405Z" fill="#FAF7F2" />
              <path d="M214 274L244 306L304 240" stroke="currentColor" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div style={{ display: 'inline-flex', borderRadius: '999px', padding: '3px', background: '#E8E5DE' }}>
            <button onClick={() => { setLang('en'); localStorage.setItem('ew_lang', 'en'); }} style={{ border: 0, background: lang === 'en' ? '#1A221E' : 'transparent', color: lang === 'en' ? '#FAF7F2' : '#4A5568', borderRadius: '999px', padding: 'calc(6px * var(--scale, 1)) calc(14px * var(--scale, 1))', fontSize: 'calc(19px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', minHeight: 'calc(40px * var(--scale, 1))' }}>English</button>
            <button onClick={() => { setLang('af'); localStorage.setItem('ew_lang', 'af'); }} style={{ border: 0, background: lang === 'af' ? '#1A221E' : 'transparent', color: lang === 'af' ? '#FAF7F2' : '#4A5568', borderRadius: '999px', padding: 'calc(6px * var(--scale, 1)) calc(14px * var(--scale, 1))', fontSize: 'calc(19px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', minHeight: 'calc(40px * var(--scale, 1))' }}>Afrikaans</button>
          </div>
        </div>

        {/* Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(9px * var(--scale, 1))', fontSize: 'calc(21px * var(--scale, 1))', color: '#718096', marginTop: 'calc(-4px * var(--scale, 1))', position: 'relative', zIndex: 2 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 'calc(24px * var(--scale, 1))', height: 'calc(24px * var(--scale, 1))', color: '#ECC94B', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <span style={{ fontWeight: 600 }}>{dateText}</span>
        </div>

        {/* Linked view */}
        {view === 'linked' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'calc(18px * var(--scale, 1))', flex: '1 1 auto', position: 'relative', zIndex: 2 }}>
            <div style={{ width: 'calc(96px * var(--scale, 1))', height: 'calc(96px * var(--scale, 1))', borderRadius: '50%', background: '#E6FFFA', color: '#157A4C', display: 'grid', placeItems: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(56px * var(--scale, 1))', height: 'calc(56px * var(--scale, 1))' }}>
                <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M9 18h6" /><path d="M9.5 10.5l2 2 3.5-4" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: 'calc(36px * var(--scale, 1))', lineHeight: 1.1, fontWeight: 700 }}>{t.linkedTitle(residentProfile.name)}</h2>
            <p style={{ margin: 0, fontSize: 'calc(22px * var(--scale, 1))', color: '#718096' }}>{t.linkedBody}</p>
            <button onClick={() => setView('morning')} style={{ marginTop: 'calc(8px * var(--scale, 1))', width: '100%', minHeight: 'calc(84px * var(--scale, 1))', border: 0, borderRadius: '26px', background: '#157A4C', color: '#fff', fontSize: 'calc(28px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', boxShadow: '0 18px 30px -16px rgba(21,122,76,0.4)' }}>{t.go}</button>
          </div>
        )}

        {/* Main screens */}
        {view !== 'linked' && view !== 'lang_select' && (
          <>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <h1 style={{ margin: 0, fontSize: 'calc(40px * var(--scale, 1))', lineHeight: 1.06, fontWeight: 700 }}>
                <span>{t.hello(now.getHours())}</span>{' '}
                <span style={{ display: 'block' }}>{residentProfile.name}</span>
              </h1>
              <p style={{ margin: 'calc(8px * var(--scale, 1)) 0 0', fontSize: 'calc(22px * var(--scale, 1))', color: '#718096' }}>{t.where(residentProfile)}</p>
            </div>

            {isLate && view === 'morning' && (
              <div role="status" style={{ display: 'flex', gap: 'calc(12px * var(--scale, 1))', alignItems: 'flex-start', background: '#FEFCBF', borderLeft: '8px solid #ECC94B', borderRadius: '14px', padding: 'calc(14px * var(--scale, 1)) calc(16px * var(--scale, 1))', fontSize: 'calc(20px * var(--scale, 1))', position: 'relative', zIndex: 2 }}>
                <span>{t.late}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(16px * var(--scale, 1))', flex: '1 0 auto', position: 'relative', zIndex: 2 }}>
              {view === 'morning' && (
                <button onClick={handleOkClick} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'calc(6px * var(--scale, 1))', width: '100%', border: 0, borderRadius: '30px', cursor: 'pointer', padding: 'calc(18px * var(--scale, 1)) calc(20px * var(--scale, 1))', background: '#157A4C', color: '#fff', minHeight: 'calc(176px * var(--scale, 1))', flex: '3 1 0', boxShadow: '0 18px 30px -16px rgba(21,122,76,0.4)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(66px * var(--scale, 1))', height: 'calc(66px * var(--scale, 1))' }}><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-7" /></svg>
                  <span style={{ fontSize: 'calc(44px * var(--scale, 1))', fontWeight: 700 }}>{t.okLabel}</span>
                  <span style={{ fontSize: 'calc(20px * var(--scale, 1))', opacity: 0.94 }}>{t.okSub}</span>
                </button>
              )}

              {view === 'ok' && (
                <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--scale, 1))', borderRadius: '30px', padding: 'calc(22px * var(--scale, 1))', flex: '3 1 0', minHeight: 'calc(176px * var(--scale, 1))', background: '#E6FFFA', color: '#157A4C', border: '2px solid #B2DFDB' }}>
                  <h2 style={{ margin: 0, fontSize: 'calc(30px * var(--scale, 1))', lineHeight: 1.1, fontWeight: 700 }}>{t.okTitle(residentProfile.name)}</h2>
                  <p style={{ margin: 0, fontSize: 'calc(21px * var(--scale, 1))' }}>{t.okBody}</p>
                  <p style={{ margin: 0, fontSize: 'calc(20px * var(--scale, 1))', opacity: 0.85 }}>{t.okTime(formatHHMM(checkInTime || now))}</p>
                  <button onClick={handleUndo} style={{ marginTop: 'auto', alignSelf: 'flex-start', background: 'transparent', border: '2px solid currentColor', borderRadius: '999px', padding: 'calc(10px * var(--scale, 1)) calc(18px * var(--scale, 1))', fontSize: 'calc(20px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', color: 'inherit' }}>{t.undo}</button>
                </div>
              )}

              {(view === 'morning' || view === 'ok') && (
                <button onClick={handleHelpClick} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'calc(6px * var(--scale, 1))', width: '100%', border: 0, borderRadius: '30px', cursor: 'pointer', padding: 'calc(18px * var(--scale, 1)) calc(20px * var(--scale, 1))', background: '#C53030', color: '#fff', minHeight: view === 'ok' ? 'calc(118px * var(--scale, 1))' : 'calc(122px * var(--scale, 1))', flex: view === 'ok' ? '1.15 1 0' : '2 1 0', boxShadow: '0 18px 30px -16px rgba(197,48,48,0.4)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(50px * var(--scale, 1))', height: 'calc(50px * var(--scale, 1))' }}>
                    <path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" /><path d="M13 10.5V5.5a1.5 1.5 0 0 1 3 0v6" /><path d="M16 12.5V8a1.5 1.5 0 0 1 3 0v6.5A6.5 6.5 0 0 1 12.5 21H11a5 5 0 0 1-4.2-2.3L4 14.5a1.6 1.6 0 0 1 2.6-1.9L7 13.5" />
                  </svg>
                  <span style={{ fontSize: 'calc(44px * var(--scale, 1))', fontWeight: 700 }}>{t.helpLabel}</span>
                  {view === 'morning' && <span style={{ fontSize: 'calc(20px * var(--scale, 1))', opacity: 0.94 }}>{t.helpSub}</span>}
                </button>
              )}

              {view === 'help' && (
                <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--scale, 1))', borderRadius: '30px', padding: 'calc(22px * var(--scale, 1))', flex: '1 1 0', minHeight: 'calc(176px * var(--scale, 1))', background: '#FED7D7', color: '#C53030', border: '2px solid #FEB2B2' }}>
                  <h2 style={{ margin: 0, fontSize: 'calc(30px * var(--scale, 1))', lineHeight: 1.1, fontWeight: 700 }}>{t.helpTitle}</h2>
                  <p style={{ margin: 0, fontSize: 'calc(21px * var(--scale, 1))' }}>{t.helpBody(residentProfile.sister)}</p>
                  <p style={{ margin: 0, fontSize: 'calc(20px * var(--scale, 1))', opacity: 0.85 }}>{t.helpTime(formatHHMM(helpTime || now))}</p>
                  <button onClick={handleUndo} style={{ marginTop: 'auto', alignSelf: 'flex-start', background: 'transparent', border: '2px solid currentColor', borderRadius: '999px', padding: 'calc(10px * var(--scale, 1)) calc(18px * var(--scale, 1))', fontSize: 'calc(20px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', color: 'inherit' }}>{t.cancel}</button>
                </div>
              )}
            </div>

            {/* Call Sister */}
            {residentProfile.phone && (
              <a href={`tel:${residentProfile.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 'calc(14px * var(--scale, 1))', width: '100%', minHeight: 'calc(70px * var(--scale, 1))', padding: 'calc(8px * var(--scale, 1)) calc(14px * var(--scale, 1))', borderRadius: '22px', border: '3px solid #1A221E', background: view === 'help' ? '#1A221E' : 'transparent', color: view === 'help' ? '#FAF7F2' : '#1A221E', fontSize: 'calc(22px * var(--scale, 1))', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', position: 'relative', zIndex: 2 }}>
                <span style={{ width: 'calc(46px * var(--scale, 1))', height: 'calc(46px * var(--scale, 1))', borderRadius: '50%', background: '#E6FFFA', color: '#157A4C', display: 'grid', placeItems: 'center', fontSize: 'calc(18px * var(--scale, 1))', fontWeight: 700, flexShrink: 0 }}>{residentProfile.sisterInitials}</span>
                <span style={{ flex: 1 }}><span>{t.call(residentProfile.sister)}</span><small style={{ display: 'block', fontSize: 'calc(20px * var(--scale, 1))', color: view === 'help' ? '#FAF7F2' : '#718096' }}>{t.callSub}</small></span>
              </a>
            )}
          </>
        )}

        {/* Flash overlay */}
        {flashKind && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', background: flashKind === 'ok' ? '#157A4C' : '#C53030', color: '#FFF', zIndex: 10 }}>
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '190px', height: '190px' }}>
              <path d={flashKind === 'ok' ? 'M10 25l10 10 18-22' : 'M24 10v18M24 36v2'} />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
