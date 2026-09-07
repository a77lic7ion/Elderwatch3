import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';

// Helper to get today's date in SAST
function getTodaySAST(): string {
  const now = new Date();
  const sastDate = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  return sastDate.toISOString().split('T')[0];
}

// Admin Overview - Get all homes, staff, residents
export async function fetchAdminOverview() {
  const homesSnap = await getDocs(collection(db, 'homes'));
  const staffSnap = await getDocs(collection(db, 'staff'));
  const residentsSnap = await getDocs(collection(db, 'residents'));
  const today = getTodaySAST();

  const homes = homesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const residents = residentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Get today's check-in status for each resident
  const residentsWithStatus = await Promise.all(residents.map(async (r: any) => {
    const checkinId = `${r.homeId}_${r.id}_${today}`;
    const checkinDoc = await getDoc(doc(db, 'checkins', checkinId));
    return {
      ...r,
      homeName: homes.find((h: any) => h.id === r.homeId)?.name || 'Unknown Home',
      todayStatus: checkinDoc.exists() ? checkinDoc.data().status : 'awaiting',
    };
  }));

  const homesWithCounts = homes.map((h: any) => ({
    ...h,
    staffCount: staff.filter((s: any) => s.homeId === h.id).length,
    residentsCount: residents.filter((r: any) => r.homeId === h.id).length,
  }));

  const staffWithHome = staff.map((s: any) => ({
    ...s,
    homeName: homes.find((h: any) => h.id === s.homeId)?.name || 'Unassigned',
    password: s.passwordHash || '',
  }));

  return {
    homes: homesWithCounts,
    staff: staffWithHome,
    residents: residentsWithStatus,
    stats: {
      totalHomes: homes.length,
      totalStaff: staff.length,
      totalResidents: residents.length,
    },
  };
}

// Add Home
export async function addHome(name: string, cutoffTime: string, timezone: string = 'Africa/Johannesburg') {
  const id = `home-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newHome = {
    id,
    name: name.trim(),
    cutoffTime: cutoffTime.trim() || '09:15',
    timezone,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'homes', id), newHome);
  return newHome;
}

// Update Home
export async function updateHome(homeId: string, updates: Partial<{ name: string; cutoffTime: string; timezone: string }>) {
  const homeRef = doc(db, 'homes', homeId);
  await setDoc(homeRef, updates, { merge: true });
  const snap = await getDoc(homeRef);
  return { id: snap.id, ...snap.data() };
}

// Delete Home
export async function deleteHome(homeId: string) {
  // Delete home
  await deleteDoc(doc(db, 'homes', homeId));
  
  // Delete associated staff
  const staffSnap = await getDocs(query(collection(db, 'staff'), where('homeId', '==', homeId)));
  for (const s of staffSnap.docs) {
    await deleteDoc(doc(db, 'staff', s.id));
  }
  
  // Delete associated residents
  const residentsSnap = await getDocs(query(collection(db, 'residents'), where('homeId', '==', homeId)));
  for (const r of residentsSnap.docs) {
    await deleteDoc(doc(db, 'residents', r.id));
  }
}

// Add Staff
export async function addStaff(name: string, email: string, password: string, role: string, homeId: string) {
  const id = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newStaff = {
    id,
    homeId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: password.trim(),
    role,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'staff', id), newStaff);
  return newStaff;
}

// Update Staff
export async function updateStaff(staffId: string, updates: any) {
  const staffRef = doc(db, 'staff', staffId);
  await setDoc(staffRef, updates, { merge: true });
  const snap = await getDoc(staffRef);
  return { id: snap.id, ...snap.data() };
}

// Delete Staff
export async function deleteStaff(staffId: string) {
  await deleteDoc(doc(db, 'staff', staffId));
}

// Add Resident
export async function addResident(homeId: string, name: string, roomNumber: string, phone: string, emergencyContact: string, notes: string) {
  const id = `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const linkCode = `LINK-${roomNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
  const newResident = {
    id,
    homeId,
    name: name.trim(),
    roomNumber: roomNumber.trim(),
    phone: (phone || '').trim(),
    emergencyContact: (emergencyContact || '').trim(),
    notes: (notes || '').trim(),
    isDeviceLinked: false,
    linkedAt: null,
    oneTimeLinkCode: linkCode,
    pushToken: null,
    createdAt: new Date().toISOString(),
  };
  
  await setDoc(doc(db, 'residents', id), newResident);
  
  // Initialize today's checkin
  const today = getTodaySAST();
  const checkinId = `${homeId}_${id}_${today}`;
  await setDoc(doc(db, 'checkins', checkinId), {
    id: checkinId,
    homeId,
    residentId: id,
    date: today,
    status: 'awaiting',
    timestamp: new Date().toISOString(),
    updatedBy: 'morning_job',
  });
  
  return newResident;
}

// Delete Resident
export async function deleteResident(residentId: string) {
  await deleteDoc(doc(db, 'residents', residentId));
  
  // Clean up checkins
  const checkinsSnap = await getDocs(query(collection(db, 'checkins'), where('residentId', '==', residentId)));
  for (const c of checkinsSnap.docs) {
    await deleteDoc(doc(db, 'checkins', c.id));
  }
}

// Get Residents for a home
export async function fetchResidents(homeId: string) {
  const today = getTodaySAST();
  const residentsSnap = await getDocs(query(collection(db, 'residents'), where('homeId', '==', homeId)));
  
  const residents = await Promise.all(residentsSnap.docs.map(async (d) => {
    const r = { id: d.id, ...d.data() } as any;
    const checkinId = `${homeId}_${r.id}_${today}`;
    const checkinDoc = await getDoc(doc(db, 'checkins', checkinId));
    return {
      ...r,
      todayStatus: checkinDoc.exists() ? checkinDoc.data().status : 'awaiting',
      todayTimestamp: checkinDoc.exists() ? checkinDoc.data().timestamp : null,
      todayUpdatedBy: checkinDoc.exists() ? checkinDoc.data().updatedBy : null,
    };
  }));
  
  return residents;
}

// Staff Override Check-in
export async function staffOverrideCheckin(residentId: string, status: string, notes: string, homeId: string) {
  const today = getTodaySAST();
  const checkinId = `${homeId}_${residentId}_${today}`;
  const record = {
    id: checkinId,
    homeId,
    residentId,
    date: today,
    status,
    timestamp: new Date().toISOString(),
    updatedBy: 'staff_override',
    notes: notes || 'Updated manually by staff',
  };
  await setDoc(doc(db, 'checkins', checkinId), record);
  return record;
}

// Get Home by ID
export async function fetchHome(homeId: string) {
  const snap = await getDoc(doc(db, 'homes', homeId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// Update Home Settings
export async function updateHomeSettings(homeId: string, name: string, cutoffTime: string) {
  await setDoc(doc(db, 'homes', homeId), { name, cutoffTime }, { merge: true });
  return await fetchHome(homeId);
}

// Get Resident History
export async function fetchResidentHistory(residentId: string, homeId: string) {
  const residentDoc = await getDoc(doc(db, 'residents', residentId));
  if (!residentDoc.exists()) return null;
  
  const resident = { id: residentDoc.id, ...residentDoc.data() };
  
  const checkinsSnap = await getDocs(
    query(
      collection(db, 'checkins'),
      where('residentId', '==', residentId),
      where('homeId', '==', homeId)
    )
  );
  
  const history = checkinsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (a.date > b.date ? -1 : 1))
    .slice(0, 14);
  
  return { resident, history };
}
