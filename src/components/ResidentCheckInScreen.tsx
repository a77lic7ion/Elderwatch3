import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceBinding } from '../types';
import { BackendEvaluationModal } from './BackendEvaluationModal';
import { saveCheckinToFirestore } from '../lib/firebase';
import { useAppTheme } from './ThemeToggle';

interface ResidentCheckInScreenProps {
  onNavigateToAdmin?: () => void;
  onNavigateToLink?: (code?: string) => void;
}

type ViewState = 'morning' | 'ok' | 'help' | 'linked';
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
  name: 'Margaret',
  room: 'Room 14',
  wing: 'Willow Cottage',
  sister: 'Sarah',
  sisterInitials: 'SB',
  phone: '+27118944000',
};

const CUTOFF_TIME = '9:15';

// Translations for English and Afrikaans
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
    week: 'This week',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    linkedTitle: (name: string) => `This phone is now yours, ${name}.`,
    linkedBody: "Every morning, open it and tap the green button. That's all.",
    go: 'Continue',
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
    week: 'Hierdie week',
    days: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Sa', 'So'],
    linkedTitle: (name: string) => `Hierdie foon is nou joune, ${name}.`,
    linkedBody: 'Maak dit elke oggend oop en tik die groen knoppie. Dis al.',
    go: 'Gaan voort',
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
}) => {
  // Device binding from storage
  const [deviceBinding, setDeviceBinding] = useState<DeviceBinding | null>(null);
  const [residentProfile, setResidentProfile] = useState<ResidentProfile>(DEFAULT_RESIDENT);

  // App states
  const [view, setView] = useState<ViewState>('morning');
  const [lang, setLang] = useState<LangCode>(() => {
    try {
      const saved = localStorage.getItem('ew_lang');
      if (saved === 'af' || saved === 'en') return saved;
    } catch {
      // fallback
    }
    return 'en';
  });

  const [isLate, setIsLate] = useState<boolean>(false);
  const [textSize, setTextSize] = useState<number>(1);
  const [isNight, setIsNight] = useAppTheme();
  const [checkInTime, setCheckInTime] = useState<Date | null>(null);
  const [helpTime, setHelpTime] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [standaloneTerminalMode, setStandaloneTerminalMode] = useState(false);

  // Flash animation state
  const [flashKind, setFlashKind] = useState<'ok' | 'help' | null>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Week history state (Mon-Sat, Sun today)
  const [weekHistory] = useState<Array<'ok' | 'help' | null>>([
    'ok',
    'ok',
    'ok',
    'help',
    'ok',
    'ok',
  ]);

  // Audio chimes using Web Audio API
  const playTone = useCallback((good: boolean) => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g);
      g.connect(ac.destination);
      o.type = 'sine';

      if (good) {
        o.frequency.setValueAtTime(523, ac.currentTime); // C5
        o.frequency.setValueAtTime(784, ac.currentTime + 0.18); // G5
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.7);
        o.start();
        o.stop(ac.currentTime + 0.72);
      } else {
        o.frequency.setValueAtTime(440, ac.currentTime); // A4
        o.frequency.setValueAtTime(330, ac.currentTime + 0.25); // E4
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.22, ac.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
        o.start();
        o.stop(ac.currentTime + 0.92);
      }
    } catch {
      // Audio context error or not allowed
    }
  }, []);

  // Haptic feedback
  const buzz = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration error
    }
  }, []);

  // Trigger flash
  const triggerFlash = useCallback((kind: 'ok' | 'help') => {
    setFlashKind(kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlashKind(null);
    }, 1100);
  }, []);

  // Load device binding and past today check-in
  useEffect(() => {
    try {
      const saved = localStorage.getItem('elderwatch_device_binding');
      if (saved) {
        const parsed: DeviceBinding = JSON.parse(saved);
        setDeviceBinding(parsed);

        // Derive initials
        const nameParts = parsed.residentName.split(' ');
        const initials = nameParts.length > 1 ? `${nameParts[0][0]}${nameParts[1][0]}` : nameParts[0].substring(0, 2);

        setResidentProfile({
          name: parsed.residentName.split(' ')[0] || parsed.residentName,
          room: `Room ${parsed.roomNumber}`,
          wing: parsed.homeName || 'Care Home',
          sister: 'Sarah',
          sisterInitials: initials.toUpperCase(),
          phone: '+27118944000',
        });

        // Check today's checkin
        const todayStr = new Date().toISOString().split('T')[0];
        const lastCheckinKey = `elderwatch_checkin_${parsed.residentId}_${todayStr}`;
        const existingCheckin = localStorage.getItem(lastCheckinKey);
        if (existingCheckin) {
          const parsedCheckin = JSON.parse(existingCheckin);
          if (parsedCheckin.status === 'ok') {
            setView('ok');
            setCheckInTime(new Date(parsedCheckin.timestamp));
          } else if (parsedCheckin.status === 'not_ok') {
            setView('help');
            setHelpTime(new Date(parsedCheckin.timestamp));
          }
        }
      } else {
        // If not paired yet, set to default resident for demo preview
        setResidentProfile(DEFAULT_RESIDENT);
      }
    } catch (e) {
      console.error('Error loading device state:', e);
    }
  }, []);

  // Check if after 9:15 cutoff automatically
  useEffect(() => {
    const checkCutoff = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const isPastCutoff = hours > 9 || (hours === 9 && minutes >= 15);
      setIsLate(isPastCutoff);
    };
    checkCutoff();
    const interval = setInterval(checkCutoff, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync night theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-night', isNight ? 'on' : 'off');
    try {
      localStorage.setItem('ew_night', isNight ? 'on' : 'off');
    } catch {
      // ignore
    }
  }, [isNight]);

  // Sync text scale to root CSS property
  useEffect(() => {
    document.documentElement.style.setProperty('--scale', String(textSize));
  }, [textSize]);

  // Language switch handler
  const handleLangChange = (newLang: LangCode) => {
    setLang(newLang);
    try {
      localStorage.setItem('ew_lang', newLang);
    } catch {
      // storage error
    }
  };

  // Submit OK check-in
  const handleOkClick = async () => {
    if (submitting) return;
    const now = new Date();
    setCheckInTime(now);
    playTone(true);
    buzz(60);
    triggerFlash('ok');
    setView('ok');

    const resId = deviceBinding?.residentId || 'res-margaret';
    const hId = deviceBinding?.homeId || 'home-st-jude';
    const todayStr = now.toISOString().split('T')[0];

    try {
      setSubmitting(true);
      localStorage.setItem(
        `elderwatch_checkin_${resId}_${todayStr}`,
        JSON.stringify({ status: 'ok', timestamp: now.toISOString() })
      );

      // Save to Firebase Firestore
      saveCheckinToFirestore(hId, resId, 'ok').catch((e) =>
        console.warn('Firestore direct write deferred:', e)
      );

      await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resId,
          homeId: hId,
          status: 'ok',
        }),
      });
    } catch (err) {
      console.warn('Check-in network queued offline:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Help check-in
  const handleHelpClick = async () => {
    if (submitting) return;
    const now = new Date();
    setHelpTime(now);
    playTone(false);
    buzz([120, 60, 120]);
    triggerFlash('help');
    setView('help');

    const resId = deviceBinding?.residentId || 'res-margaret';
    const hId = deviceBinding?.homeId || 'home-st-jude';
    const todayStr = now.toISOString().split('T')[0];

    try {
      setSubmitting(true);
      localStorage.setItem(
        `elderwatch_checkin_${resId}_${todayStr}`,
        JSON.stringify({ status: 'not_ok', timestamp: now.toISOString() })
      );

      // Save to Firebase Firestore
      saveCheckinToFirestore(hId, resId, 'not_ok').catch((e) =>
        console.warn('Firestore direct write deferred:', e)
      );

      await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resId,
          homeId: hId,
          status: 'not_ok',
        }),
      });
    } catch (err) {
      console.warn('Help alert network queued offline:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Undo checkin
  const handleUndo = async () => {
    setView('morning');
    setCheckInTime(null);
    setHelpTime(null);

    const resId = deviceBinding?.residentId || 'res-margaret';
    const hId = deviceBinding?.homeId || 'home-st-jude';
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.removeItem(`elderwatch_checkin_${resId}_${todayStr}`);

    // Update Firestore to awaiting
    saveCheckinToFirestore(hId, resId, 'awaiting').catch((e) =>
      console.warn('Firestore undo deferred:', e)
    );

    try {
      await fetch('/api/checkin/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId: resId, homeId: hId }),
      });
    } catch {
      // offline
    }
  };

  const t = T[lang];
  const now = new Date();
  let dateText = '';
  try {
    const wd = new Intl.DateTimeFormat(t.locale, { weekday: 'long' }).format(now);
    const mo = new Intl.DateTimeFormat(t.locale, { month: 'long' }).format(now);
    dateText = `${wd} ${now.getDate()} ${mo}`;
  } catch {
    dateText = now.toDateString();
  }

  // Component rendering helper for the inside of the phone app
  const renderAppScreen = (screenView: ViewState, screenLate: boolean, isMini = false) => {
    return (
      <div
        className="app-inner"
        style={{
          fontFamily: '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif',
          background: 'var(--paper)',
          color: 'var(--ink)',
          fontSize: 'calc(20px * var(--scale))',
          lineHeight: 1.35,
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: isMini
            ? '30px 18px 18px'
            : 'calc(58px * var(--scale)) calc(22px * var(--scale)) calc(20px * var(--scale))',
          gap: 'calc(12px * var(--scale))',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Soft sunlight wash backdrop */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '46%',
            background: 'radial-gradient(120% 100% at 12% 0%, var(--sun-wash), transparent 62%)',
            pointerEvents: 'none',
          }}
        />

        {/* 1. TOP BAR: LOGO & LANGUAGE SWITCH */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            minHeight: 'calc(44px * var(--scale))',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* ElderWatch House Logo */}
          <span style={{ display: 'inline-flex', color: 'var(--ok)' }} aria-hidden="true">
            <svg viewBox="0 0 512 512" fill="none" style={{ width: 'calc(34px * var(--scale))', height: 'calc(34px * var(--scale))' }}>
              <path
                d="M256 36L48 214C37 223.4 43.6 242 58 242H88V434C88 456.09 105.91 474 128 474H384C406.09 474 424 456.09 424 434V242H454C468.4 242 475 223.4 464 214L256 36Z"
                fill="currentColor"
              />
              <path
                d="M256 405C256 405 120 324 120 236C120 188 158 152 204 152C232 152 248 166 256 177C264 166 280 152 308 152C354 152 392 188 392 236C392 324 256 405 256 405Z"
                fill="var(--paper)"
              />
              <path
                d="M214 274L244 306L304 240"
                stroke="currentColor"
                strokeWidth="26"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          {/* Bilingual Pills */}
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '999px',
              padding: '3px',
              background: 'var(--paper-3)',
            }}
            role="group"
            aria-label="Language selection"
          >
            <button
              type="button"
              onClick={() => handleLangChange('en')}
              style={{
                border: 0,
                background: lang === 'en' ? 'var(--ink)' : 'transparent',
                color: lang === 'en' ? 'var(--paper)' : 'var(--ink-2)',
                borderRadius: '999px',
                padding: 'calc(6px * var(--scale)) calc(14px * var(--scale))',
                fontSize: 'calc(19px * var(--scale))',
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 'calc(40px * var(--scale))',
                transition: 'background-color 160ms ease, color 160ms ease',
              }}
              aria-pressed={lang === 'en'}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleLangChange('af')}
              style={{
                border: 0,
                background: lang === 'af' ? 'var(--ink)' : 'transparent',
                color: lang === 'af' ? 'var(--paper)' : 'var(--ink-2)',
                borderRadius: '999px',
                padding: 'calc(6px * var(--scale)) calc(14px * var(--scale))',
                fontSize: 'calc(19px * var(--scale))',
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 'calc(40px * var(--scale))',
                transition: 'background-color 160ms ease, color 160ms ease',
              }}
              aria-pressed={lang === 'af'}
            >
              Afrikaans
            </button>
          </div>
        </div>

        {/* 2. DATE ROW */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'calc(9px * var(--scale))',
            fontSize: 'calc(21px * var(--scale))',
            color: 'var(--ink-2)',
            marginTop: 'calc(-4px * var(--scale))',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            style={{ width: 'calc(24px * var(--scale))', height: 'calc(24px * var(--scale))', color: 'var(--sun)', flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <span style={{ fontWeight: 600 }}>{dateText}</span>
        </div>

        {/* 3. VIEW: "LINKED" (FIRST OPEN SCREEN) */}
        {screenView === 'linked' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 'calc(18px * var(--scale))',
              flex: '1 1 auto',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: 'calc(96px * var(--scale))',
                height: 'calc(96px * var(--scale))',
                borderRadius: '50%',
                background: 'var(--jac-tint)',
                color: 'var(--jac)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(56px * var(--scale))', height: 'calc(56px * var(--scale))' }} aria-hidden="true">
                <rect x="6" y="2" width="12" height="20" rx="2.5" />
                <path d="M9 18h6" />
                <path d="M9.5 10.5l2 2 3.5-4" />
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: 'calc(36px * var(--scale))', lineHeight: 1.1, letterSpacing: '-0.01em', fontWeight: 700 }}>
              {t.linkedTitle(residentProfile.name)}
            </h2>
            <p style={{ margin: 0, fontSize: 'calc(22px * var(--scale))', color: 'var(--ink-2)' }}>
              {t.linkedBody}
            </p>
            <button
              type="button"
              onClick={() => setView('morning')}
              style={{
                marginTop: 'calc(8px * var(--scale))',
                width: '100%',
                minHeight: 'calc(84px * var(--scale))',
                border: 0,
                borderRadius: '26px',
                background: 'var(--ok)',
                color: 'var(--on-ok)',
                fontSize: 'calc(28px * var(--scale))',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 18px 30px -16px var(--ok-shadow), inset 0 1px 0 rgba(255,255,255,0.22)',
              }}
            >
              {t.go}
            </button>
          </div>
        )}

        {/* 4. MAIN SCREENS (MORNING / OK / HELP) */}
        {screenView !== 'linked' && (
          <>
            {/* GREETING */}
            <div style={{ position: 'relative', zIndex: 2 }}>
              <h1 style={{ margin: 0, fontSize: 'calc(40px * var(--scale))', lineHeight: 1.06, fontWeight: 700, letterSpacing: '-0.015em' }}>
                <span>{t.hello(now.getHours())}</span>{' '}
                <span style={{ display: 'block' }}>{residentProfile.name}</span>
              </h1>
              <p style={{ margin: 'calc(8px * var(--scale)) 0 0', fontSize: 'calc(22px * var(--scale))', color: 'var(--ink-2)' }}>
                {t.where(residentProfile)}
              </p>
            </div>

            {/* LATE CUTOFF BANNER */}
            {screenLate && screenView === 'morning' && (
              <div
                role="status"
                style={{
                  display: 'flex',
                  gap: 'calc(12px * var(--scale))',
                  alignItems: 'flex-start',
                  background: 'var(--sun-tint)',
                  borderLeft: '8px solid var(--sun)',
                  borderRadius: '14px',
                  padding: 'calc(14px * var(--scale)) calc(16px * var(--scale))',
                  fontSize: 'calc(20px * var(--scale))',
                  lineHeight: 1.35,
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 'calc(28px * var(--scale))', height: 'calc(28px * var(--scale))', flexShrink: 0, marginTop: '2px', color: 'var(--sun)' }} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>{t.late}</span>
              </div>
            )}

            {/* ACTIONS CONTAINER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(16px * var(--scale))', flex: '1 0 auto', position: 'relative', zIndex: 2 }}>
              
              {/* BUTTON 1: GREEN "I'M OK" (VISIBLE IN MORNING VIEW) */}
              {screenView === 'morning' && (
                <button
                  type="button"
                  id="okBtn"
                  onClick={handleOkClick}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'calc(6px * var(--scale))',
                    width: '100%',
                    border: 0,
                    borderRadius: '30px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: 'calc(18px * var(--scale)) calc(20px * var(--scale))',
                    background: 'var(--ok)',
                    color: 'var(--on-ok)',
                    minHeight: 'calc(176px * var(--scale))',
                    flex: '3 1 0',
                    boxShadow: '0 18px 30px -16px var(--ok-shadow), inset 0 1px 0 rgba(255,255,255,0.22)',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 140ms ease, background-color 140ms ease',
                  }}
                  onMouseDown={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(0.98)')}
                  onMouseUp={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(66px * var(--scale))', height: 'calc(66px * var(--scale))' }} aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M7.5 12.5l3 3 6-7" />
                  </svg>
                  <span style={{ fontSize: 'calc(44px * var(--scale))', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.015em' }}>
                    {t.okLabel}
                  </span>
                  <span style={{ fontSize: 'calc(20px * var(--scale))', lineHeight: 1.3, opacity: 0.94, maxWidth: '30ch' }}>
                    {t.okSub}
                  </span>
                </button>
              )}

              {/* STATUS OK CONFIRMATION CARD (VISIBLE IN OK VIEW) */}
              {screenView === 'ok' && (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'calc(10px * var(--scale))',
                    borderRadius: '30px',
                    padding: 'calc(22px * var(--scale)) calc(22px * var(--scale)) calc(18px * var(--scale))',
                    flex: '3 1 0',
                    minHeight: 'calc(176px * var(--scale))',
                    background: 'var(--ok-tint)',
                    color: 'var(--ok-ink)',
                    border: '2px solid var(--ok-line)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(14px * var(--scale))' }}>
                    <div
                      style={{
                        width: 'calc(72px * var(--scale))',
                        height: 'calc(72px * var(--scale))',
                        borderRadius: '50%',
                        background: 'var(--ok)',
                        color: 'var(--on-ok)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(44px * var(--scale))', height: 'calc(44px * var(--scale))' }} aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7" />
                      </svg>
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'calc(30px * var(--scale))', lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {t.okTitle(residentProfile.name)}
                    </h2>
                  </div>
                  <p style={{ margin: 0, fontSize: 'calc(21px * var(--scale))', lineHeight: 1.35 }}>
                    {t.okBody}
                  </p>
                  <p style={{ margin: 0, fontSize: 'calc(20px * var(--scale))', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
                    {t.okTime(formatHHMM(checkInTime || now))}
                  </p>
                  <button
                    type="button"
                    onClick={handleUndo}
                    style={{
                      marginTop: 'auto',
                      alignSelf: 'flex-start',
                      background: 'transparent',
                      border: '2px solid currentColor',
                      borderRadius: '999px',
                      padding: 'calc(10px * var(--scale)) calc(18px * var(--scale))',
                      fontSize: 'calc(20px * var(--scale))',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: 'calc(52px * var(--scale))',
                      color: 'inherit',
                      transition: 'background-color 140ms ease, color 140ms ease',
                    }}
                  >
                    {t.undo}
                  </button>
                </div>
              )}

              {/* BUTTON 2: RED "I NEED HELP" (VISIBLE IN MORNING & OK VIEWS) */}
              {(screenView === 'morning' || screenView === 'ok') && (
                <button
                  type="button"
                  id="helpBtn"
                  onClick={handleHelpClick}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'calc(6px * var(--scale))',
                    width: '100%',
                    border: 0,
                    borderRadius: '30px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: 'calc(18px * var(--scale)) calc(20px * var(--scale))',
                    background: 'var(--help)',
                    color: 'var(--on-help)',
                    minHeight: screenView === 'ok' ? 'calc(118px * var(--scale))' : 'calc(122px * var(--scale))',
                    flex: screenView === 'ok' ? '1.15 1 0' : '2 1 0',
                    boxShadow: '0 18px 30px -16px var(--help-shadow), inset 0 1px 0 rgba(255,255,255,0.22)',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    transition: 'transform 140ms ease, background-color 140ms ease',
                  }}
                  onMouseDown={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(0.98)')}
                  onMouseUp={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(50px * var(--scale))', height: 'calc(50px * var(--scale))' }} aria-hidden="true">
                    <path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11" />
                    <path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10" />
                    <path d="M13 10.5V5.5a1.5 1.5 0 0 1 3 0v6" />
                    <path d="M16 12.5V8a1.5 1.5 0 0 1 3 0v6.5A6.5 6.5 0 0 1 12.5 21H11a5 5 0 0 1-4.2-2.3L4 14.5a1.6 1.6 0 0 1 2.6-1.9L7 13.5" />
                  </svg>
                  <span style={{ fontSize: 'calc(44px * var(--scale))', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.015em' }}>
                    {t.helpLabel}
                  </span>
                  {screenView === 'morning' && (
                    <span style={{ fontSize: 'calc(20px * var(--scale))', lineHeight: 1.3, opacity: 0.94, maxWidth: '30ch' }}>
                      {t.helpSub}
                    </span>
                  )}
                </button>
              )}

              {/* STATUS HELP ALERT CARD (VISIBLE IN HELP VIEW) */}
              {screenView === 'help' && (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'calc(10px * var(--scale))',
                    borderRadius: '30px',
                    padding: 'calc(22px * var(--scale)) calc(22px * var(--scale)) calc(18px * var(--scale))',
                    flex: '1 1 0',
                    minHeight: 'calc(176px * var(--scale))',
                    background: 'var(--help-tint)',
                    color: 'var(--help-ink)',
                    border: '2px solid var(--help-line)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(14px * var(--scale))' }}>
                    <div
                      style={{
                        width: 'calc(72px * var(--scale))',
                        height: 'calc(72px * var(--scale))',
                        borderRadius: '50%',
                        background: 'var(--help)',
                        color: 'var(--on-help)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(44px * var(--scale))', height: 'calc(44px * var(--scale))' }} aria-hidden="true">
                        <path d="M12 5v9" />
                        <circle cx="12" cy="18.5" r="1.2" fill="currentColor" />
                      </svg>
                    </div>
                    <h2 style={{ margin: 0, fontSize: 'calc(30px * var(--scale))', lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.01em' }}>
                      {t.helpTitle}
                    </h2>
                  </div>
                  <p style={{ margin: 0, fontSize: 'calc(21px * var(--scale))', lineHeight: 1.35 }}>
                    {t.helpBody(residentProfile.sister)}
                  </p>
                  <p style={{ margin: 0, fontSize: 'calc(20px * var(--scale))', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
                    {t.helpTime(formatHHMM(helpTime || now))}
                  </p>
                  <button
                    type="button"
                    onClick={handleUndo}
                    style={{
                      marginTop: 'auto',
                      alignSelf: 'flex-start',
                      background: 'transparent',
                      border: '2px solid currentColor',
                      borderRadius: '999px',
                      padding: 'calc(10px * var(--scale)) calc(18px * var(--scale))',
                      fontSize: 'calc(20px * var(--scale))',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: 'calc(52px * var(--scale))',
                      color: 'inherit',
                      transition: 'background-color 140ms ease, color 140ms ease',
                    }}
                  >
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>

            {/* CALL SISTER BAR */}
            <a
              id="callBtn"
              href={`tel:${residentProfile.phone}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(14px * var(--scale))',
                width: '100%',
                minHeight: 'calc(70px * var(--scale))',
                padding: 'calc(8px * var(--scale)) calc(14px * var(--scale)) calc(8px * var(--scale)) calc(10px * var(--scale))',
                borderRadius: '22px',
                border: '3px solid var(--ink)',
                background: screenView === 'help' ? 'var(--ink)' : 'transparent',
                color: screenView === 'help' ? 'var(--paper)' : 'var(--ink)',
                fontSize: 'calc(22px * var(--scale))',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'none',
                position: 'relative',
                zIndex: 2,
                transition: 'background-color 140ms ease, color 140ms ease',
              }}
            >
              <span
                style={{
                  width: 'calc(46px * var(--scale))',
                  height: 'calc(46px * var(--scale))',
                  borderRadius: '50%',
                  background: 'var(--jac-tint)',
                  color: 'var(--jac)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 'calc(18px * var(--scale))',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {residentProfile.sisterInitials}
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span>{t.call(residentProfile.sister)}</span>
                <small
                  style={{
                    display: 'block',
                    fontSize: 'calc(20px * var(--scale))',
                    fontWeight: 400,
                    color: screenView === 'help' ? 'var(--paper)' : 'var(--ink-2)',
                    lineHeight: 1.2,
                    opacity: screenView === 'help' ? 0.85 : 1,
                  }}
                >
                  {t.callSub}
                </small>
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 'calc(28px * var(--scale))', height: 'calc(28px * var(--scale))', flexShrink: 0 }} aria-hidden="true">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </svg>
            </a>

            {/* THIS WEEK STRIP */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--scale))', paddingTop: 'calc(2px * var(--scale))', position: 'relative', zIndex: 2 }}>
              <span style={{ fontSize: 'calc(20px * var(--scale))', color: 'var(--ink-2)', fontWeight: 600 }}>
                {t.week}
              </span>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2px', minWidth: 0 }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const dayOffset = 6 - i;
                  const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
                  const dayIndex = (dayDate.getDay() + 6) % 7; // Mon=0 .. Sun=6
                  const isToday = dayOffset === 0;

                  const status = isToday
                    ? screenView === 'ok'
                      ? 'ok'
                      : screenView === 'help'
                      ? 'help'
                      : null
                    : weekHistory[i];

                  return (
                    <span
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: 'calc(20px * var(--scale))',
                        color: isToday ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: isToday ? 700 : 400,
                        flex: '1 1 0',
                        minWidth: 0,
                      }}
                    >
                      <i
                        style={{
                          width: 'calc(34px * var(--scale))',
                          height: 'calc(34px * var(--scale))',
                          borderRadius: '50%',
                          border: isToday
                            ? '3px solid var(--ink)'
                            : status === 'ok'
                            ? '2px solid var(--ok)'
                            : status === 'help'
                            ? '2px solid var(--help)'
                            : '2px solid var(--line)',
                          background: status === 'ok' ? 'var(--ok)' : status === 'help' ? 'var(--help)' : 'transparent',
                          color: status === 'ok' ? 'var(--on-ok)' : status === 'help' ? 'var(--on-help)' : 'inherit',
                          display: 'grid',
                          placeItems: 'center',
                          fontStyle: 'normal',
                          fontWeight: 700,
                          fontSize: 'calc(18px * var(--scale))',
                        }}
                      >
                        {status === 'ok' ? '✓' : status === 'help' ? '!' : ''}
                      </i>
                      <span>{t.days[dayIndex]}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* 5. FULLSCREEN ANIMATED FLASH ON TAP */}
        {flashKind && (
          <div
            className="flash-play"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
              background: flashKind === 'ok' ? 'var(--ok)' : 'var(--help)',
              color: '#FFFFFF',
              zIndex: 10,
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '190px', height: '190px' }}>
              <path d={flashKind === 'ok' ? 'M10 25l10 10 18-22' : 'M24 10v18M24 36v2'} />
            </svg>
          </div>
        )}
      </div>
    );
  };

  // 1. FULLSCREEN TERMINAL VIEW (For phone devices / standalone PWA)
  if (standaloneTerminalMode) {
    return (
      <div
        className="w-full h-screen h-[100dvh] overflow-hidden select-none"
        style={{ background: 'var(--paper)' }}
      >
        {/* Floating Return Button */}
        <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
          <button
            onClick={() => setStandaloneTerminalMode(false)}
            className="px-3 py-1.5 rounded-full bg-black/60 text-white/90 hover:text-white text-xs font-bold backdrop-blur-md border border-white/20 shadow-lg cursor-pointer transition"
          >
            Show Stage & Notes
          </button>
        </div>

        {renderAppScreen(view, isLate)}
      </div>
    );
  }

  // 2. STAGE & STORYBOARD DESKTOP PRESENTATION (From prototype)
  return (
    <div
      className="min-h-screen py-10 px-4 sm:px-8 select-none"
      style={{
        backgroundColor: 'var(--paper-2)',
        color: 'var(--ink)',
        fontFamily: '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif',
      }}
    >
      {/* Glow background orb */}
      <div
        style={{
          position: 'absolute',
          left: '6%',
          top: '40px',
          width: '640px',
          height: '640px',
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, var(--glow), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="max-w-[1220px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)] gap-12 lg:gap-16 items-start relative z-10">
        
        {/* LEFT COLUMN: THE PHONE TERMINAL & STORYBOARD */}
        <div className="flex flex-col items-center gap-10">
          
          {/* Realistic Phone Bezel */}
          <div
            className="w-full max-w-[404px] p-3 rounded-[60px] relative"
            style={{
              background: 'linear-gradient(160deg, var(--bezel-a), var(--bezel-b))',
              boxShadow: 'var(--bezel-shadow), inset 0 0 0 1px var(--bezel-edge)',
            }}
          >
            {/* Dynamic Island */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '24px',
                transform: 'translateX(-50%)',
                width: '118px',
                height: '34px',
                borderRadius: '20px',
                background: '#060807',
                zIndex: 5,
              }}
              aria-hidden="true"
            />

            {/* Phone Screen Canvas */}
            <div
              className="h-[844px] rounded-[48px] overflow-hidden relative"
              style={{ background: 'var(--paper)' }}
            >
              {renderAppScreen(view, isLate)}
            </div>
          </div>

          {/* STORYBOARD: EVERY SCREEN A RESIDENT CAN SEE */}
          <section className="w-full max-w-[760px] pt-4" aria-label="Every screen a resident can see">
            <h2
              className="text-xl font-bold mb-4 font-display"
              style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
            >
              Every screen a resident can ever see
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Mini 1: First open */}
              <div className="flex flex-col gap-2">
                <div
                  className="w-full aspect-[390/844] rounded-2xl overflow-hidden relative border"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                >
                  <div
                    style={{
                      transform: 'scale(0.46)',
                      transformOrigin: 'top left',
                      width: '390px',
                      height: '844px',
                      pointerEvents: 'none',
                    }}
                  >
                    {renderAppScreen('linked', false, true)}
                  </div>
                </div>
                <figcaption className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--ink)', display: 'block' }}>First open</b>
                  After a sister pairs the phone. One button.
                </figcaption>
              </div>

              {/* Mini 2: Every morning */}
              <div className="flex flex-col gap-2">
                <div
                  className="w-full aspect-[390/844] rounded-2xl overflow-hidden relative border"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                >
                  <div
                    style={{
                      transform: 'scale(0.46)',
                      transformOrigin: 'top left',
                      width: '390px',
                      height: '844px',
                      pointerEvents: 'none',
                    }}
                  >
                    {renderAppScreen('morning', false, true)}
                  </div>
                </div>
                <figcaption className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--ink)', display: 'block' }}>Every morning</b>
                  Greeting, green, red. Nothing else.
                </figcaption>
              </div>

              {/* Mini 3: After tapping green */}
              <div className="flex flex-col gap-2">
                <div
                  className="w-full aspect-[390/844] rounded-2xl overflow-hidden relative border"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                >
                  <div
                    style={{
                      transform: 'scale(0.46)',
                      transformOrigin: 'top left',
                      width: '390px',
                      height: '844px',
                      pointerEvents: 'none',
                    }}
                  >
                    {renderAppScreen('ok', false, true)}
                  </div>
                </div>
                <figcaption className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--ink)', display: 'block' }}>After tapping green</b>
                  Calm confirmation, time, undo. Red stays.
                </figcaption>
              </div>

              {/* Mini 4: After tapping red */}
              <div className="flex flex-col gap-2">
                <div
                  className="w-full aspect-[390/844] rounded-2xl overflow-hidden relative border"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}
                >
                  <div
                    style={{
                      transform: 'scale(0.46)',
                      transformOrigin: 'top left',
                      width: '390px',
                      height: '844px',
                      pointerEvents: 'none',
                    }}
                  >
                    {renderAppScreen('help', false, true)}
                  </div>
                </div>
                <figcaption className="text-xs" style={{ color: 'var(--ink-2)' }}>
                  <b style={{ color: 'var(--ink)', display: 'block' }}>After tapping red</b>
                  Who was told, what to do, call the sister.
                </figcaption>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: STICKY DESIGN NOTES & INTERACTIVE CONTROLS */}
        <aside className="lg:sticky lg:top-8 space-y-6">
          
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight leading-tight">
              One tap every morning. That is the whole app.
            </h1>
            <p className="mt-3 text-base leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              The resident's phone is paired once by a sister. After that it shows a greeting, a green button and a red button. No menus, no passwords, nothing to learn.
            </p>
          </div>

          {/* INTERACTIVE "TRY IT" CONTROLS */}
          <div
            className="p-5 rounded-2xl border space-y-4"
            style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}
          >
            <h2 className="text-base font-bold font-display">Try it</h2>

            {/* View switcher */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                What the resident sees
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setView('linked')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    view === 'linked'
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  First open
                </button>
                <button
                  type="button"
                  onClick={() => setView('morning')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    view === 'morning'
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Morning
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!checkInTime) setCheckInTime(new Date());
                    setView('ok');
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    view === 'ok'
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Checked in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!helpTime) setHelpTime(new Date());
                    setView('help');
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    view === 'help'
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Asked for help
                </button>
                <button
                  type="button"
                  onClick={() => setIsLate((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    isLate
                      ? 'bg-[var(--sun)] text-white border-[var(--sun)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  {isLate ? 'Cutoff: Active (After 9:15)' : 'Cutoff: Test 9:15'}
                </button>
              </div>
            </div>

            {/* Text size */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Text size
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTextSize(1)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    textSize === 1
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Large (1.0x)
                </button>
                <button
                  type="button"
                  onClick={() => setTextSize(1.14)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    textSize === 1.14
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Extra large (1.14x)
                </button>
              </div>
            </div>

            {/* Day or night theme */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-2)' }}>
                Day or night
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsNight(false)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    !isNight
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => setIsNight(true)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    isNight
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'border-[var(--line)] hover:border-[var(--ink-2)] text-[var(--ink)]'
                  }`}
                >
                  Night
                </button>
              </div>
            </div>

            {/* Display mode & Architecture */}
            <div className="pt-2 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--line)' }}>
              <button
                type="button"
                onClick={() => setStandaloneTerminalMode(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--ink)] text-[var(--paper)] hover:opacity-90 transition cursor-pointer"
              >
                Expand to Full Phone Terminal →
              </button>

              <button
                type="button"
                onClick={() => setShowEvaluationModal(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition cursor-pointer"
              >
                Firebase Blaze Plan Cost Analysis 📊
              </button>
            </div>
          </div>

          {/* DESIGN PRINCIPLES FOR 85-YEAR-OLDS */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold font-display">Built for an 85-year-old's eyes and hands</h2>
            <ul className="space-y-2 text-sm leading-relaxed list-disc list-inside" style={{ color: 'var(--ink-2)' }}>
              <li>
                The typeface is <strong>Atkinson Hyperlegible</strong>, drawn by the Braille Institute for low vision. Nothing on the screen is smaller than 20 px.
              </li>
              <li>
                The two buttons fill about seven tenths of the screen, with a wide gap between green and red. A shaky hand cannot miss.
              </li>
              <li>
                Every colour pair sits above a <strong>5:1 contrast ratio</strong>, by day and at night.
              </li>
              <li>
                Every tap can be undone from the next screen ("Tapped by mistake? Undo"), eliminating hesitation or fear.
              </li>
              <li>
                <strong>English and Afrikaans</strong> switch in one tap, and the preference is saved.
              </li>
              <li>
                The nurse is a named person. <em>"Call Sister Sarah"</em> dials her mobile directly.
              </li>
              <li>
                Help stays one tap away after checking in. Feeling unwell at 11 am is still covered.
              </li>
            </ul>
          </div>

          {/* WHAT THE VILLAGE GETS */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold font-display">What the village gets</h2>
            <ul className="space-y-2 text-sm leading-relaxed list-disc list-inside" style={{ color: 'var(--ink-2)' }}>
              <li>A morning board that only highlights the two or three residents who need a visit.</li>
              <li>A message to family when Mom taps green, and an alert when she does not.</li>
              <li>No pendants, no charging hubs, no wearable batteries. It runs on the phone the resident already owns.</li>
            </ul>
          </div>

          {/* NAVIGATE TO STAFF PORTAL */}
          {onNavigateToAdmin && (
            <div className="pt-2">
              <button
                onClick={onNavigateToAdmin}
                className="text-xs font-bold underline cursor-pointer"
                style={{ color: 'var(--ink-2)' }}
              >
                Open Staff Nursing Dashboard →
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Backend / Firebase Evaluation Modal */}
      {showEvaluationModal && (
        <BackendEvaluationModal onClose={() => setShowEvaluationModal(false)} />
      )}
    </div>
  );
};
