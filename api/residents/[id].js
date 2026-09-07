import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing resident ID' });
  }

  try {
    // Initialize Firebase Admin
    const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
    const app = initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore(app);

    // Delete the resident document
    await db.collection('residents').doc(id).delete();

    // Also delete any checkins for this resident
    const checkinsSnapshot = await db.collection('checkins')
      .where('residentId', '==', id)
      .get();
    
    const batch = db.batch();
    checkinsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return res.status(200).json({ success: true, message: 'Resident deleted successfully' });
  } catch (error) {
    console.error('Error deleting resident:', error);
    return res.status(500).json({ error: 'Failed to delete resident' });
  }
}
