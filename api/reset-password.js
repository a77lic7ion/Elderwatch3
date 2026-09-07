import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let app;

function getFirebaseAdmin() {
  if (app) return app;
  
  const apps = getApps();
  if (apps.length > 0) {
    app = apps[0];
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase admin credentials');
  }

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  
  return app;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { staffId, newPassword } = req.body;

  if (!staffId || !newPassword) {
    return res.status(400).json({ error: 'Missing staffId or newPassword' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const adminApp = getFirebaseAdmin();
    const auth = getAuth(adminApp);
    const db = getFirestore(adminApp);

    // Update password in Firebase Auth
    await auth.updateUser(staffId, { password: newPassword });

    // Update passwordHash in Firestore staff document
    await db.collection('staff').doc(staffId).update({ passwordHash: newPassword });

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}
