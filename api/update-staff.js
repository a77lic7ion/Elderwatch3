import { GoogleAuth } from 'google-auth-library';

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_PRIVATE_KEY,
};

const API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyAQb0poaNUJVv6ND4MfbzWcyxgjyBCBJyI';

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: SERVICE_ACCOUNT,
    scopes: ['https://www.googleapis.com/auth/identitytoolkit', 'https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

async function generateCustomToken(uid) {
  const crypto = await import('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: SERVICE_ACCOUNT.client_email,
    sub: SERVICE_ACCOUNT.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid,
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(SERVICE_ACCOUNT.private_key, 'base64url');
  return `${signingInput}.${signature}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { staffId, email, password, name, role, homeId } = req.body;
    if (!staffId || !email || !name || !role || !homeId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const accessToken = await getAccessToken();

    // 1. Update Firebase Auth user
    if (password) {
      const customToken = await generateCustomToken(staffId);
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      });
      const signInData = await signInRes.json();
      if (signInData.idToken) {
        await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${signInData.idToken}` },
          body: JSON.stringify({ password, returnSecureToken: true }),
        });
      }
    }

    // 2. Update custom claims
    try {
      const customToken = await generateCustomToken(staffId);
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      });
      const signInData = await signInRes.json();
      if (signInData.idToken) {
        await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${signInData.idToken}` },
          body: JSON.stringify({ customAttributes: JSON.stringify({ role, homeId }), returnSecureToken: true }),
        });
      }
    } catch (e) {
      console.warn('Could not update custom claims:', e.message);
    }

    // 3. Update Firestore staff document
    const staffDoc = {
      fields: {
        id: { stringValue: staffId },
        homeId: { stringValue: homeId },
        name: { stringValue: name },
        email: { stringValue: email.toLowerCase() },
        role: { stringValue: role },
        ...(password ? { passwordHash: { stringValue: password } } : {}),
      }
    };

    await fetch(
      `https://firestore.googleapis.com/v1/projects/${SERVICE_ACCOUNT.project_id}/databases/(default)/documents/staff/${staffId}?updateMask.fieldPaths=homeId&updateMask.fieldPaths=name&updateMask.fieldPaths=email&updateMask.fieldPaths=role${password ? '&updateMask.fieldPaths=passwordHash' : ''}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(staffDoc),
      }
    );

    return res.status(200).json({ success: true, user: { id: staffId, email, name, role, homeId } });
  } catch (error) {
    console.error('Error updating staff:', error);
    return res.status(500).json({ error: error.message || 'Failed to update staff' });
  }
}
