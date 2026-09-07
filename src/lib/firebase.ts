import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocFromServer,
  onSnapshot,
  query,
  where,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { CheckIn, Resident } from '../types';

interface EnvMeta {
  env?: {
    VITE_FIREBASE_API_KEY?: string;
    VITE_FIREBASE_AUTH_DOMAIN?: string;
    VITE_FIREBASE_PROJECT_ID?: string;
    VITE_FIREBASE_STORAGE_BUCKET?: string;
    VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
    VITE_FIREBASE_APP_ID?: string;
    VITE_FIREBASE_MEASUREMENT_ID?: string;
  };
}

const meta = import.meta as unknown as EnvMeta;
const env = meta.env || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAQb0poaNUJVv6ND4MfbzWcyxgjyBCBJyI',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'elderwatch-14712.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'elderwatch-14712',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'elderwatch-14712.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '981482830351',
  appId: env.VITE_FIREBASE_APP_ID || '1:981482830351:web:4823b2f99f590cc269017a',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

// Initialize Firebase App
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db: Firestore = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Auth helper functions
export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// Connection state tracking
export interface FirebaseConnectionStatus {
  connected: boolean;
  projectId: string;
  lastChecked: string;
  error?: string;
}

let connectionStatus: FirebaseConnectionStatus = {
  connected: false,
  projectId: firebaseConfig.projectId,
  lastChecked: new Date().toISOString(),
};

/**
 * Validate connection to Firestore using getDocFromServer as required
 */
export async function validateFirestoreConnection(): Promise<FirebaseConnectionStatus> {
  try {
    // Attempt to read connection test document
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    connectionStatus = {
      connected: true,
      projectId: firebaseConfig.projectId,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // If permissions deny read on 'system/connection_test' or not-found, that still means we reached the Firestore server
    const isServerReachable =
      msg.includes('permission-denied') ||
      msg.includes('not-found') ||
      !msg.includes('offline');

    connectionStatus = {
      connected: isServerReachable,
      projectId: firebaseConfig.projectId,
      lastChecked: new Date().toISOString(),
      error: isServerReachable ? undefined : msg,
    };
  }
  return connectionStatus;
}

export function getCachedConnectionStatus(): FirebaseConnectionStatus {
  return connectionStatus;
}

/**
 * Record a check-in in Firestore
 */
export async function saveCheckinToFirestore(
  homeId: string,
  residentId: string,
  status: 'ok' | 'not_ok' | 'awaiting',
  notes?: string
): Promise<void> {
  // Use SAST (UTC+2) date to match admin panel queries
  const now = new Date();
  const sastDate = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  const today = sastDate.toISOString().split('T')[0];
  const docId = `${homeId}_${residentId}_${today}`;
  const checkinRef = doc(db, 'checkins', docId);

  const payload: CheckIn = {
    id: docId,
    homeId,
    residentId,
    date: today,
    status,
    timestamp: new Date().toISOString(),
    updatedBy: 'resident',
    notes,
  };

  await setDoc(checkinRef, payload, { merge: true });
}

/**
 * Real-time subscription to today's check-ins for a home
 */
export function subscribeToTodayCheckins(
  homeId: string,
  date: string,
  onCheckins: (checkins: Record<string, CheckIn>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, 'checkins'),
      where('homeId', '==', homeId),
      where('date', '==', date)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const checkinsMap: Record<string, CheckIn> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as CheckIn;
          checkinsMap[data.residentId] = data;
        });
        onCheckins(checkinsMap);
      },
      (error) => {
        console.warn('Firestore real-time subscription error:', error);
        if (onError) onError(error);
      }
    );
  } catch (err) {
    console.warn('Could not establish Firestore subscription:', err);
    return () => {};
  }
}

/**
 * Real-time subscription to residents roster in Firestore
 */
export function subscribeToResidents(
  homeId: string,
  onResidents: (residents: Resident[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  try {
    const q = query(collection(db, 'residents'), where('homeId', '==', homeId));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: Resident[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as Resident);
        });
        onResidents(list);
      },
      (error) => {
        console.warn('Firestore residents subscription error:', error);
        if (onError) onError(error);
      }
    );
  } catch (err) {
    console.warn('Could not subscribe to residents:', err);
    return () => {};
  }
}
