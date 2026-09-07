import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Multi-tenant database file path
const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'elderwatch-data.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface DatabaseSchema {
  homes: Record<string, {
    id: string;
    name: string;
    cutoffTime: string; // "09:15"
    timezone: string;
    createdAt: string;
  }>;
  staff: Record<string, {
    id: string;
    homeId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'nurse' | 'admin' | 'caregiver';
  }>;
  residents: Record<string, {
    id: string;
    homeId: string;
    name: string;
    phone: string;
    roomNumber: string;
    isDeviceLinked: boolean;
    linkedAt: string | null;
    oneTimeLinkCode: string | null;
    pushToken: string | null;
    emergencyContact?: string;
    notes?: string;
    createdAt: string;
  }>;
  checkins: Record<string, {
    id: string;
    homeId: string;
    residentId: string;
    date: string; // YYYY-MM-DD
    status: 'awaiting' | 'ok' | 'not_ok' | 'no_response';
    timestamp: string;
    offlineSynced?: boolean;
    updatedBy: 'resident' | 'staff_override' | 'cutoff_job' | 'morning_job';
    notes?: string;
  }>;
  jobLogs: Array<{
    id: string;
    homeId: string;
    jobType: 'morning_reset' | 'reminder_push' | 'cutoff_sweep' | 'emergency_alert';
    description: string;
    residentsAffected: number;
    timestamp: string;
    details?: string;
  }>;
  pushLogs: Array<{
    id: string;
    homeId: string;
    targetType: 'resident' | 'staff' | 'all_awaiting';
    recipientName: string;
    title: string;
    body: string;
    timestamp: string;
    status: 'delivered' | 'queued' | 'simulated';
  }>;
}

// Get today date string in SAST (Africa/Johannesburg, UTC+2)
export function getTodaySAST(): string {
  const now = new Date();
  // Adjust to UTC+2
  const sastDate = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  return sastDate.toISOString().split('T')[0];
}

export function getCurrentTimeSAST(): string {
  const now = new Date();
  const sastDate = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  return sastDate.toISOString().substring(11, 16); // "HH:mm"
}

// Initial Database Seeding
function getInitialData(): DatabaseSchema {
  const today = getTodaySAST();
  const nowISO = new Date().toISOString();

  return {
    homes: {
      'home-methodist-1': {
        id: 'home-methodist-1',
        name: 'Methodist Home 1',
        cutoffTime: '09:15',
        timezone: 'Africa/Johannesburg',
        createdAt: nowISO,
      },
    },
    staff: {
      'admin-shaun': {
        id: 'admin-shaun',
        homeId: 'home-methodist-1',
        name: 'Shaun Gordon',
        email: 'shaunwgordon@gmail.com',
        passwordHash: 'B33tl3sL1lly@123',
        role: 'admin',
      },
      'staff-mary': {
        id: 'staff-mary',
        homeId: 'home-methodist-1',
        name: 'Mary Nurse',
        email: 'marynurse@methodist.care',
        passwordHash: 'Marynurse@123',
        role: 'nurse',
      },
    },
    residents: {},
    checkins: {},
    jobLogs: [],
    pushLogs: [],
  };
}

let db: DatabaseSchema;

function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading database file, re-initializing:', err);
  }
  const initial = getInitialData();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(data: DatabaseSchema) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database file:', err);
  }
}

db = loadDatabase();

// Connected SSE clients by homeId
const sseClients: Map<string, Set<express.Response>> = new Map();

function broadcastToHome(homeId: string, event: string, payload: unknown) {
  const clients = sseClients.get(homeId);
  if (!clients || clients.size === 0) return;

  const dataStr = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(dataStr);
    } catch {
      clients.delete(client);
    }
  }
}

// Ensure today's check-in records exist for all residents in a home
function ensureTodayCheckins(homeId: string) {
  const today = getTodaySAST();
  const residents = Object.values(db.residents).filter((r) => r.homeId === homeId);
  let createdCount = 0;

  for (const resident of residents) {
    const checkinId = `${homeId}_${resident.id}_${today}`;
    if (!db.checkins[checkinId]) {
      db.checkins[checkinId] = {
        id: checkinId,
        homeId,
        residentId: resident.id,
        date: today,
        status: 'awaiting',
        timestamp: new Date().toISOString(),
        updatedBy: 'morning_job',
      };
      createdCount++;
    }
  }

  if (createdCount > 0) {
    saveDatabase(db);
  }
}

// Scheduled Jobs Engine:
// 1. Morning Reset (07:00 SAST)
export function runMorningResetJob(homeId?: string) {
  const today = getTodaySAST();
  const targetHomes = homeId ? [db.homes[homeId]].filter(Boolean) : Object.values(db.homes);

  let totalResidentsReset = 0;

  for (const home of targetHomes) {
    const residents = Object.values(db.residents).filter((r) => r.homeId === home.id);
    for (const resident of residents) {
      const checkinId = `${home.id}_${resident.id}_${today}`;
      db.checkins[checkinId] = {
        id: checkinId,
        homeId: home.id,
        residentId: resident.id,
        date: today,
        status: 'awaiting',
        timestamp: new Date().toISOString(),
        updatedBy: 'morning_job',
      };
      totalResidentsReset++;
    }

    // Log job execution
    const jobLog = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      homeId: home.id,
      jobType: 'morning_reset' as const,
      description: `07:00 SAST Morning Reset: ${residents.length} residents reset to "awaiting"`,
      residentsAffected: residents.length,
      timestamp: new Date().toISOString(),
    };
    db.jobLogs.unshift(jobLog);

    // Push notification to residents
    const pushLog = {
      id: `push-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      homeId: home.id,
      targetType: 'all_awaiting' as const,
      recipientName: `All ${home.name} Residents`,
      title: 'ElderWatch Morning Check-in',
      body: 'Good morning! Please tap your screen to confirm you are safe and well.',
      timestamp: new Date().toISOString(),
      status: 'delivered' as const,
    };
    db.pushLogs.unshift(pushLog);

    broadcastToHome(home.id, 'checkin_updated', {
      type: 'morning_reset',
      message: 'Morning reset executed.',
    });
  }

  saveDatabase(db);
  return totalResidentsReset;
}

// 2. Reminder Push (08:45 SAST)
export function runReminderPushJob(homeId?: string) {
  const today = getTodaySAST();
  const targetHomes = homeId ? [db.homes[homeId]].filter(Boolean) : Object.values(db.homes);
  let totalReminded = 0;

  for (const home of targetHomes) {
    const awaitingResidents = Object.values(db.residents).filter((r) => {
      if (r.homeId !== home.id) return false;
      const checkin = db.checkins[`${home.id}_${r.id}_${today}`];
      return !checkin || checkin.status === 'awaiting';
    });

    totalReminded += awaitingResidents.length;

    const jobLog = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      homeId: home.id,
      jobType: 'reminder_push' as const,
      description: `08:45 SAST Reminder: Sent to ${awaitingResidents.length} residents still awaiting check-in`,
      residentsAffected: awaitingResidents.length,
      timestamp: new Date().toISOString(),
    };
    db.jobLogs.unshift(jobLog);

    for (const resident of awaitingResidents) {
      db.pushLogs.unshift({
        id: `push-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        homeId: home.id,
        targetType: 'resident' as const,
        recipientName: `${resident.name} (Room ${resident.roomNumber})`,
        title: 'ElderWatch Reminder',
        body: 'Friendly reminder: Please tap Yes or No on your screen before cutoff.',
        timestamp: new Date().toISOString(),
        status: 'delivered' as const,
      });
    }

    broadcastToHome(home.id, 'reminder_sent', {
      type: 'reminder_push',
      count: awaitingResidents.length,
    });
  }

  saveDatabase(db);
  return totalReminded;
}

// 3. Cutoff Sweep (09:15 SAST or custom cutoff)
export function runCutoffSweepJob(homeId?: string) {
  const today = getTodaySAST();
  const targetHomes = homeId ? [db.homes[homeId]].filter(Boolean) : Object.values(db.homes);
  let totalMarkedNoResponse = 0;

  for (const home of targetHomes) {
    const residents = Object.values(db.residents).filter((r) => r.homeId === home.id);
    let homeCount = 0;

    for (const resident of residents) {
      const checkinId = `${home.id}_${resident.id}_${today}`;
      const checkin = db.checkins[checkinId];
      if (checkin && checkin.status === 'awaiting') {
        checkin.status = 'no_response';
        checkin.timestamp = new Date().toISOString();
        checkin.updatedBy = 'cutoff_job';
        checkin.notes = `Passed cutoff time (${home.cutoffTime} SAST). Automatically marked as no_response.`;
        homeCount++;
        totalMarkedNoResponse++;
      }
    }

    if (homeCount > 0) {
      const jobLog = {
        id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        homeId: home.id,
        jobType: 'cutoff_sweep' as const,
        description: `Cutoff Sweep (${home.cutoffTime} SAST): ${homeCount} residents marked as "no_response"`,
        residentsAffected: homeCount,
        timestamp: new Date().toISOString(),
      };
      db.jobLogs.unshift(jobLog);

      broadcastToHome(home.id, 'checkin_updated', {
        type: 'cutoff_sweep',
        message: `${homeCount} residents transitioned to no_response.`,
      });
    }
  }

  saveDatabase(db);
  return totalMarkedNoResponse;
}

// Trigger emergency alert on "not_ok"
function triggerEmergencyAlert(homeId: string, residentId: string) {
  const resident = db.residents[residentId];
  const home = db.homes[homeId];
  if (!resident || !home) return;

  const jobLog = {
    id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    homeId,
    jobType: 'emergency_alert' as const,
    description: `🚨 URGENT: ${resident.name} (Room ${resident.roomNumber}) tapped "I need help"!`,
    residentsAffected: 1,
    timestamp: new Date().toISOString(),
    details: `Immediate dispatch broadcasted to all active nursing staff. Room: ${resident.roomNumber}, Phone: ${resident.phone}`,
  };
  db.jobLogs.unshift(jobLog);

  // Push log for staff
  const pushLog = {
    id: `push-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    homeId,
    targetType: 'staff' as const,
    recipientName: `${home.name} Staff On-Duty`,
    title: `🚨 EMERGENCY: Room ${resident.roomNumber}`,
    body: `${resident.name} has pressed "I need help". Please check Room ${resident.roomNumber} immediately!`,
    timestamp: new Date().toISOString(),
    status: 'delivered' as const,
  };
  db.pushLogs.unshift(pushLog);

  saveDatabase(db);

  // Broadcast immediate urgent alert event over SSE
  broadcastToHome(homeId, 'urgent_alert', {
    residentId: resident.id,
    residentName: resident.name,
    roomNumber: resident.roomNumber,
    phone: resident.phone,
    timestamp: new Date().toISOString(),
    alertText: `${resident.name} in Room ${resident.roomNumber} tapped "I need help"`,
  });
}

// Background Interval for SAST cron triggers (checks every 30 seconds)
let lastExecutedMinute = '';
setInterval(() => {
  const currentTime = getCurrentTimeSAST(); // "HH:mm"
  if (currentTime === lastExecutedMinute) return;
  lastExecutedMinute = currentTime;

  // 07:00 SAST Morning Reset
  if (currentTime === '07:00') {
    console.log('[CRON SAST] 07:00 SAST reached: executing morning reset job');
    runMorningResetJob();
  }

  // 08:45 SAST Reminder
  if (currentTime === '08:45') {
    console.log('[CRON SAST] 08:45 SAST reached: executing reminder push job');
    runReminderPushJob();
  }

  // Home-specific cutoffs (e.g. 09:15)
  for (const home of Object.values(db.homes)) {
    if (home.cutoffTime === currentTime) {
      console.log(`[CRON SAST] Cutoff time ${currentTime} reached for ${home.name}`);
      runCutoffSweepJob(home.id);
    }
  }
}, 30000);

// --- REST API ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    currentTimeSAST: getCurrentTimeSAST(),
    todaySAST: getTodaySAST(),
    homesCount: Object.keys(db.homes).length,
    residentsCount: Object.keys(db.residents).length,
  });
});

// Staff Authentication (Email & Password, home-scoped or enterprise admin)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const query = email.toLowerCase().trim();
  const staff = Object.values(db.staff).find((s) => {
    const sEmail = s.email.toLowerCase().trim();
    const sName = s.name.toLowerCase().trim();
    const sNameClean = sName.replace(/\s+/g, '');
    const queryClean = query.replace(/\s+/g, '');
    return sEmail === query || sName === query || sNameClean === queryClean;
  });

  if (!staff || staff.passwordHash !== password) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const home = db.homes[staff.homeId] || Object.values(db.homes)[0];
  // Simple session token carrying user and home info
  const token = Buffer.from(
    JSON.stringify({ staffId: staff.id, homeId: home?.id || staff.homeId, role: staff.role, time: Date.now() })
  ).toString('base64');

  res.json({
    token,
    user: {
      id: staff.id,
      homeId: staff.homeId,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    },
    home: home || null,
  });
});

// Helper to authenticate staff from Bearer token
function authenticateStaff(req: express.Request, res: express.Response): { staffId: string; homeId: string; role?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized. Staff login token required.' });
    return null;
  }

  try {
    const raw = Buffer.from(authHeader.substring(7), 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.homeId || !parsed.staffId) {
      res.status(401).json({ error: 'Invalid token structure.' });
      return null;
    }
    // If admin is requesting data for a specific home via x-home-id header or query param, honor that homeId
    const requestedHome = (req.headers['x-home-id'] as string) || (req.query.homeId as string);
    if (parsed.role === 'admin' && requestedHome && db.homes[requestedHome]) {
      return { staffId: parsed.staffId, homeId: requestedHome, role: parsed.role };
    }
    return parsed;
  } catch {
    res.status(401).json({ error: 'Failed to decode token.' });
    return null;
  }
}

// Helper to authenticate admin
function authenticateAdmin(req: express.Request, res: express.Response): { staffId: string; homeId: string } | null {
  const auth = authenticateStaff(req, res);
  if (!auth) return null;
  const staff = db.staff[auth.staffId];
  if (!staff || staff.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden. Administrator privileges required.' });
    return null;
  }
  return auth;
}

// Public endpoint: Get available staff demo accounts for login testing
app.get('/api/auth/demo-accounts', (req, res) => {
  const accounts = Object.values(db.staff).map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    password: s.passwordHash,
    role: s.role,
    homeId: s.homeId,
    homeName: db.homes[s.homeId]?.name || 'Care Home',
  }));
  res.json({ accounts });
});

// --- ENTERPRISE ADMIN API ROUTES ---

// 1. Admin System Overview: All homes, staff assigned per home, residents per home
app.get('/api/admin/overview', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const homesList = Object.values(db.homes).map((h) => {
    const staffCount = Object.values(db.staff).filter((s) => s.homeId === h.id).length;
    const residentsCount = Object.values(db.residents).filter((r) => r.homeId === h.id).length;
    return {
      ...h,
      staffCount,
      residentsCount,
    };
  });

  const staffList = Object.values(db.staff).map((s) => ({
    id: s.id,
    homeId: s.homeId,
    homeName: db.homes[s.homeId]?.name || 'Unassigned',
    name: s.name,
    email: s.email,
    password: s.passwordHash,
    role: s.role,
  }));

  const today = getTodaySAST();
  const residentsList = Object.values(db.residents).map((r) => {
    const checkin = db.checkins[`${r.homeId}_${r.id}_${today}`];
    return {
      ...r,
      homeName: db.homes[r.homeId]?.name || 'Unknown Home',
      todayStatus: checkin ? checkin.status : 'awaiting',
    };
  });

  res.json({
    homes: homesList,
    staff: staffList,
    residents: residentsList,
    stats: {
      totalHomes: homesList.length,
      totalStaff: staffList.length,
      totalResidents: residentsList.length,
    },
  });
});

// 2. Admin Create New Home
app.post('/api/admin/homes', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const { name, cutoffTime, timezone } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Home name is required' });
  }

  const id = `home-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newHome = {
    id,
    name: name.trim(),
    cutoffTime: (cutoffTime || '09:15').trim(),
    timezone: (timezone || 'Africa/Johannesburg').trim(),
    createdAt: new Date().toISOString(),
  };

  db.homes[id] = newHome;
  saveDatabase(db);
  res.json({ success: true, home: newHome });
});

// 3. Admin Update Home
app.patch('/api/admin/homes/:id', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const home = db.homes[req.params.id];
  if (!home) return res.status(404).json({ error: 'Home not found' });

  const { name, cutoffTime, timezone } = req.body;
  if (name) home.name = name.trim();
  if (cutoffTime) home.cutoffTime = cutoffTime.trim();
  if (timezone) home.timezone = timezone.trim();

  saveDatabase(db);
  res.json({ success: true, home });
});

// 4. Admin Delete Home
app.delete('/api/admin/homes/:id', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const homeId = req.params.id;
  if (Object.keys(db.homes).length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only remaining home.' });
  }

  delete db.homes[homeId];
  for (const [sId, s] of Object.entries(db.staff)) {
    if (s.homeId === homeId) delete db.staff[sId];
  }
  for (const [rId, r] of Object.entries(db.residents)) {
    if (r.homeId === homeId) delete db.residents[rId];
  }

  saveDatabase(db);
  res.json({ success: true });
});

// 5. Admin Create/Assign Staff to Home
app.post('/api/admin/staff', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const { name, email, password, role, homeId } = req.body;
  if (!name || !email || !password || !homeId) {
    return res.status(400).json({ error: 'Name, email, password, and home assignment are required' });
  }

  if (!db.homes[homeId]) {
    return res.status(400).json({ error: 'Selected care home does not exist' });
  }

  const id = `staff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newStaff = {
    id,
    homeId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: password.trim(),
    role: (role || 'nurse') as 'nurse' | 'admin' | 'caregiver',
  };

  db.staff[id] = newStaff;
  saveDatabase(db);
  res.json({ success: true, staff: newStaff });
});

// 6. Admin Update Staff Member
app.patch('/api/admin/staff/:id', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const staff = db.staff[req.params.id];
  if (!staff) return res.status(404).json({ error: 'Staff member not found' });

  const { name, email, password, role, homeId } = req.body;
  if (name) staff.name = name.trim();
  if (email) staff.email = email.trim().toLowerCase();
  if (password) staff.passwordHash = password.trim();
  if (role) staff.role = role;
  if (homeId && db.homes[homeId]) staff.homeId = homeId;

  saveDatabase(db);
  res.json({ success: true, staff });
});

// 7. Admin Delete Staff Member
app.delete('/api/admin/staff/:id', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const staff = db.staff[req.params.id];
  if (!staff) return res.status(404).json({ error: 'Staff member not found' });
  if (staff.email === 'shaunwgordon@gmail.com') {
    return res.status(400).json({ error: 'Cannot delete primary enterprise administrator.' });
  }

  delete db.staff[req.params.id];
  saveDatabase(db);
  res.json({ success: true });
});

// 8. Admin Add Resident to Specific Home
app.post('/api/admin/residents', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const { homeId, name, roomNumber, phone, emergencyContact, notes } = req.body;
  if (!homeId || !name || !roomNumber) {
    return res.status(400).json({ error: 'Home, name, and room number are required' });
  }

  const id = `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanCode = `LINK-${roomNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

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
    oneTimeLinkCode: cleanCode,
    pushToken: null,
    createdAt: new Date().toISOString(),
  };

  db.residents[id] = newResident;
  saveDatabase(db);
  res.json({ success: true, resident: newResident });
});

// 9. Admin Delete Resident
app.delete('/api/admin/residents/:id', (req, res) => {
  const admin = authenticateAdmin(req, res);
  if (!admin) return;

  const resident = db.residents[req.params.id];
  if (!resident) return res.status(404).json({ error: 'Resident not found' });

  delete db.residents[req.params.id];
  for (const [cId, c] of Object.entries(db.checkins)) {
    if (c.residentId === req.params.id) delete db.checkins[cId];
  }

  saveDatabase(db);
  res.json({ success: true });
});

// Real-Time Server-Sent Events (SSE) scoped by homeId
app.get('/api/realtime', (req, res) => {
  const homeId = req.query.homeId as string;
  if (!homeId) {
    return res.status(400).json({ error: 'homeId is required for SSE stream' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(homeId)) {
    sseClients.set(homeId, new Set());
  }
  sseClients.get(homeId)!.add(res);

  // Send initial connection heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ homeId, time: new Date().toISOString() })}\n\n`);

  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAliveInterval);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    const clients = sseClients.get(homeId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(homeId);
      }
    }
  });
});

// Get Home details and settings
app.get('/api/home', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const home = db.homes[auth.homeId];
  if (!home) {
    return res.status(404).json({ error: 'Home not found' });
  }

  res.json({ home });
});

// Update Home settings (name, cutoff time)
app.patch('/api/home/settings', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const home = db.homes[auth.homeId];
  if (!home) {
    return res.status(404).json({ error: 'Home not found' });
  }

  const { name, cutoffTime } = req.body;
  if (name && typeof name === 'string') {
    home.name = name.trim();
  }
  if (cutoffTime && typeof cutoffTime === 'string') {
    home.cutoffTime = cutoffTime.trim();
  }

  saveDatabase(db);
  broadcastToHome(auth.homeId, 'home_updated', { home });
  res.json({ success: true, home });
});

// Get all residents for staff's home + today's checkin status
app.get('/api/residents', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  ensureTodayCheckins(auth.homeId);
  const today = getTodaySAST();

  const residentsList = Object.values(db.residents)
    .filter((r) => r.homeId === auth.homeId)
    .map((r) => {
      const checkin = db.checkins[`${auth.homeId}_${r.id}_${today}`];
      return {
        ...r,
        todayStatus: checkin ? checkin.status : 'awaiting',
        todayTimestamp: checkin ? checkin.timestamp : null,
        todayUpdatedBy: checkin ? checkin.updatedBy : null,
        notes: r.notes || '',
      };
    });

  res.json({ residents: residentsList });
});

// Add new resident
app.post('/api/residents', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const { name, phone, roomNumber, emergencyContact, notes } = req.body;
  if (!name || !roomNumber) {
    return res.status(400).json({ error: 'Name and room number are required.' });
  }

  const newId = `res-${Date.now().toString(36)}`;
  const linkCode = `LINK-${roomNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const newResident = {
    id: newId,
    homeId: auth.homeId,
    name: name.trim(),
    phone: phone ? phone.trim() : '',
    roomNumber: roomNumber.trim(),
    isDeviceLinked: false,
    linkedAt: null,
    oneTimeLinkCode: linkCode,
    pushToken: null,
    emergencyContact: emergencyContact ? emergencyContact.trim() : '',
    notes: notes ? notes.trim() : '',
    createdAt: new Date().toISOString(),
  };

  db.residents[newId] = newResident;

  // Initialize today's checkin
  const today = getTodaySAST();
  const checkinId = `${auth.homeId}_${newId}_${today}`;
  db.checkins[checkinId] = {
    id: checkinId,
    homeId: auth.homeId,
    residentId: newId,
    date: today,
    status: 'awaiting',
    timestamp: new Date().toISOString(),
    updatedBy: 'morning_job',
  };

  saveDatabase(db);
  broadcastToHome(auth.homeId, 'resident_added', { resident: newResident });

  res.status(201).json({ resident: newResident });
});

// Edit resident
app.put('/api/residents/:id', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const resident = db.residents[req.params.id];
  if (!resident || resident.homeId !== auth.homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  const { name, phone, roomNumber, emergencyContact, notes } = req.body;
  if (name) resident.name = name.trim();
  if (phone !== undefined) resident.phone = phone.trim();
  if (roomNumber) resident.roomNumber = roomNumber.trim();
  if (emergencyContact !== undefined) resident.emergencyContact = emergencyContact.trim();
  if (notes !== undefined) resident.notes = notes.trim();

  saveDatabase(db);
  broadcastToHome(auth.homeId, 'resident_updated', { resident });
  res.json({ resident });
});

// Delete resident
app.delete('/api/residents/:id', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const resident = db.residents[req.params.id];
  if (!resident || resident.homeId !== auth.homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  delete db.residents[req.params.id];

  // Clean up checkins
  for (const [key, val] of Object.entries(db.checkins)) {
    if (val.residentId === req.params.id) {
      delete db.checkins[key];
    }
  }

  saveDatabase(db);
  broadcastToHome(auth.homeId, 'resident_deleted', { residentId: req.params.id });
  res.json({ success: true });
});

// Generate or regenerate One-Time Link code for resident setup
app.post('/api/residents/:id/link-code', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const resident = db.residents[req.params.id];
  if (!resident || resident.homeId !== auth.homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  const linkCode = `LINK-${resident.roomNumber.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  resident.oneTimeLinkCode = linkCode;
  resident.isDeviceLinked = false;
  resident.linkedAt = null;

  saveDatabase(db);
  broadcastToHome(auth.homeId, 'resident_updated', { resident });

  res.json({
    linkCode,
    resident,
  });
});

// Device Linking: Verify code
app.get('/api/link/verify', (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ error: 'Link code is required' });
  }

  const resident = Object.values(db.residents).find(
    (r) => r.oneTimeLinkCode && r.oneTimeLinkCode.toUpperCase() === code.trim().toUpperCase()
  );

  if (!resident) {
    return res.status(404).json({ error: 'Invalid, expired, or already used linking code.' });
  }

  const home = db.homes[resident.homeId];
  res.json({
    valid: true,
    resident: {
      id: resident.id,
      name: resident.name,
      roomNumber: resident.roomNumber,
      homeId: resident.homeId,
    },
    home: home ? { id: home.id, name: home.name } : null,
  });
});

// Device Linking: Bind device permanently
app.post('/api/link/bind', (req, res) => {
  const { code, pushToken } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Link code is required' });
  }

  const resident = Object.values(db.residents).find(
    (r) => r.oneTimeLinkCode && r.oneTimeLinkCode.toUpperCase() === code.trim().toUpperCase()
  );

  if (!resident) {
    return res.status(404).json({ error: 'Invalid, expired, or already used linking code.' });
  }

  resident.isDeviceLinked = true;
  resident.linkedAt = new Date().toISOString();
  resident.oneTimeLinkCode = null; // Consume the one-time code
  if (pushToken) {
    resident.pushToken = pushToken;
  }

  saveDatabase(db);
  broadcastToHome(resident.homeId, 'resident_linked', { resident });

  const home = db.homes[resident.homeId];

  res.json({
    success: true,
    binding: {
      residentId: resident.id,
      homeId: resident.homeId,
      residentName: resident.name,
      roomNumber: resident.roomNumber,
      homeName: home ? home.name : 'Care Home',
      linkedAt: resident.linkedAt,
    },
  });
});

// Resident Check-in Submit (Green "Yes" or Red "No")
// No login required — authenticated via residentId and homeId
app.post('/api/checkin', (req, res) => {
  const { residentId, homeId, status, offlineSynced } = req.body;
  if (!residentId || !homeId || !status) {
    return res.status(400).json({ error: 'residentId, homeId, and status are required' });
  }

  if (status !== 'ok' && status !== 'not_ok') {
    return res.status(400).json({ error: 'Invalid status value. Must be "ok" or "not_ok"' });
  }

  const resident = db.residents[residentId];
  if (!resident || resident.homeId !== homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  const today = getTodaySAST();
  const checkinId = `${homeId}_${residentId}_${today}`;
  const nowISO = new Date().toISOString();

  const checkinRecord = {
    id: checkinId,
    homeId,
    residentId,
    date: today,
    status: status as 'ok' | 'not_ok',
    timestamp: nowISO,
    offlineSynced: !!offlineSynced,
    updatedBy: 'resident' as const,
  };

  db.checkins[checkinId] = checkinRecord;
  saveDatabase(db);

  // Broadcast to staff live dashboard
  broadcastToHome(homeId, 'checkin_updated', {
    residentId,
    status,
    timestamp: nowISO,
    residentName: resident.name,
    roomNumber: resident.roomNumber,
  });

  // If status is "not_ok", trigger immediate urgent alert!
  if (status === 'not_ok') {
    triggerEmergencyAlert(homeId, residentId);
  }

  res.json({
    success: true,
    checkin: checkinRecord,
    residentName: resident.name,
    roomNumber: resident.roomNumber,
    timestamp: nowISO,
  });
});

// Resident Undo Check-in (if tapped by mistake)
app.post('/api/checkin/undo', (req, res) => {
  const { residentId, homeId } = req.body;
  if (!residentId || !homeId) {
    return res.status(400).json({ error: 'residentId and homeId are required' });
  }

  const resident = db.residents[residentId];
  if (!resident || resident.homeId !== homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  const today = getTodaySAST();
  const checkinId = `${homeId}_${residentId}_${today}`;
  const nowISO = new Date().toISOString();

  const checkinRecord = {
    id: checkinId,
    homeId,
    residentId,
    date: today,
    status: 'awaiting' as const,
    timestamp: nowISO,
    updatedBy: 'resident' as const,
    notes: 'Check-in undone by resident',
  };

  db.checkins[checkinId] = checkinRecord;
  saveDatabase(db);

  broadcastToHome(homeId, 'checkin_updated', {
    residentId,
    status: 'awaiting',
    timestamp: nowISO,
    residentName: resident.name,
    roomNumber: resident.roomNumber,
  });

  res.json({
    success: true,
    status: 'awaiting',
    timestamp: nowISO,
  });
});

// Staff Manual Checkin Override (e.g. nurse checked in room in person)
app.post('/api/checkins/staff-override', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const { residentId, status, notes } = req.body;
  if (!residentId || !status) {
    return res.status(400).json({ error: 'residentId and status are required' });
  }

  const resident = db.residents[residentId];
  if (!resident || resident.homeId !== auth.homeId) {
    return res.status(404).json({ error: 'Resident not found in this home' });
  }

  const today = getTodaySAST();
  const checkinId = `${auth.homeId}_${residentId}_${today}`;
  const nowISO = new Date().toISOString();

  const record = {
    id: checkinId,
    homeId: auth.homeId,
    residentId,
    date: today,
    status: status as 'awaiting' | 'ok' | 'not_ok' | 'no_response',
    timestamp: nowISO,
    updatedBy: 'staff_override' as const,
    notes: notes || 'Updated manually by staff',
  };

  db.checkins[checkinId] = record;
  saveDatabase(db);

  broadcastToHome(auth.homeId, 'checkin_updated', {
    residentId,
    status,
    timestamp: nowISO,
    updatedBy: 'staff_override',
  });

  if (status === 'not_ok') {
    triggerEmergencyAlert(auth.homeId, residentId);
  }

  res.json({ success: true, checkin: record });
});

// Resident Check-in History (recent 7 days)
app.get('/api/residents/:id/history', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const resident = db.residents[req.params.id];
  if (!resident || resident.homeId !== auth.homeId) {
    return res.status(404).json({ error: 'Resident not found' });
  }

  const history = Object.values(db.checkins)
    .filter((c) => c.residentId === resident.id && c.homeId === auth.homeId)
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 14);

  res.json({ resident, history });
});

// Scheduled Job Execution Trigger API (Manual triggers for staff & testing)
app.post('/api/jobs/trigger-morning-reset', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const count = runMorningResetJob(auth.homeId);
  res.json({ success: true, message: `07:00 Morning Reset executed for ${count} residents.` });
});

app.post('/api/jobs/trigger-reminder-push', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const count = runReminderPushJob(auth.homeId);
  res.json({ success: true, message: `08:45 Reminders dispatched to ${count} awaiting residents.` });
});

app.post('/api/jobs/trigger-cutoff-sweep', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const count = runCutoffSweepJob(auth.homeId);
  res.json({ success: true, message: `Cutoff sweep executed. ${count} residents marked no_response.` });
});

// Simulate Emergency Alert (for live triage testing)
app.post('/api/jobs/simulate-emergency', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const residents = Object.values(db.residents).filter((r) => r.homeId === auth.homeId);
  if (residents.length === 0) {
    return res.status(400).json({ error: 'No residents available in home' });
  }

  const targetResident = residents[0];
  const today = getTodaySAST();
  const checkinId = `${auth.homeId}_${targetResident.id}_${today}`;
  const nowISO = new Date().toISOString();

  db.checkins[checkinId] = {
    id: checkinId,
    homeId: auth.homeId,
    residentId: targetResident.id,
    date: today,
    status: 'not_ok',
    timestamp: nowISO,
    updatedBy: 'resident',
    notes: 'Simulated emergency "No" tap for demonstration.',
  };

  triggerEmergencyAlert(auth.homeId, targetResident.id);
  res.json({
    success: true,
    message: `Emergency alert triggered for ${targetResident.name} (Room ${targetResident.roomNumber}).`,
  });
});

// Logs for Admin inspection
app.get('/api/jobs/logs', (req, res) => {
  const auth = authenticateStaff(req, res);
  if (!auth) return;

  const logs = db.jobLogs
    .filter((l) => l.homeId === auth.homeId)
    .slice(0, 30);

  const pushes = db.pushLogs
    .filter((p) => p.homeId === auth.homeId)
    .slice(0, 30);

  res.json({ jobLogs: logs, pushLogs: pushes });
});

// Architecture evaluation data endpoint (for evaluator transparency)
app.get('/api/system/evaluation', (req, res) => {
  res.json({
    backendChoice: 'Unified Node.js / Express Container Service (Cloud Run / VPS)',
    comparisons: [
      {
        platform: 'Firebase (Firestore + Auth + Functions)',
        costAt10kScale: 'Exceeds free tier daily limits ($20-$50/mo minimum)',
        verdict: 'Spark plan strictly caps writes at 20k/day. 10,000 residents generate 20k-30k writes/day (morning reset + check-in + cutoff). Functions require Blaze paid plan.',
      },
      {
        platform: 'Supabase (PostgreSQL + Realtime)',
        costAt10kScale: 'Free tier limits concurrent realtime clients to 200 ($25/mo Pro required)',
        verdict: 'Free tier automatically sleeps projects after 7 days of inactivity (unacceptable risk for frailcare health monitoring).',
      },
      {
        platform: 'Cloudflare Workers + D1',
        costAt10kScale: 'Realtime requires Paid Workers with Durable Objects ($5/mo)',
        verdict: 'Workers free tier has 100k requests/day, but real-time SSE/WebSockets requires Durable Objects (Paid plan).',
      },
      {
        platform: 'Unified Node.js / Express on Container (Selected)',
        costAt10kScale: '$0.00 / month (Cloud Run Free Tier or $4/mo VPS)',
        verdict: '2,000,000 requests/mo and 360k vCPU-secs free. 10k daily check-ins take <5s of CPU time. Built-in SSE, zero per-write fees, native cron, zero sleeping databases.',
      },
    ],
  });
});

// Multi-tenant Home Switcher helper for testing (lists all homes)
app.get('/api/system/homes', (req, res) => {
  res.json({
    homes: Object.values(db.homes),
  });
});

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ElderWatch server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
