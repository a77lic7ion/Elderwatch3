import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin with service account
const serviceAccountPath = path.join(__dirname, '..', '..', 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

let app: App;
if (getApps().length === 0) {
  app = initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  app = getApps()[0];
}

export const firestore = getFirestore(app);
export { FieldValue };

// Collection references
export const homesRef = firestore.collection('homes');
export const staffRef = firestore.collection('staff');
export const residentsRef = firestore.collection('residents');
export const checkinsRef = firestore.collection('checkins');
export const jobLogsRef = firestore.collection('jobLogs');
export const pushLogsRef = firestore.collection('pushLogs');

// Helper to get document by ID
export async function getDocById(collectionName: string, id: string): Promise<any | null> {
  const docSnap = await firestore.collection(collectionName).doc(id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

// Helper to set document by ID
export async function setDocById(collectionName: string, id: string, data: any): Promise<void> {
  await firestore.collection(collectionName).doc(id).set(data, { merge: true });
}

// Helper to delete document by ID
export async function deleteDocById(collectionName: string, id: string): Promise<void> {
  await firestore.collection(collectionName).doc(id).delete();
}

// Helper to get all docs in a collection
export async function getAllDocs(collectionName: string): Promise<any[]> {
  const snapshot = await firestore.collection(collectionName).get();
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

// Helper to query by field
export async function getDocsByField(collectionName: string, fieldName: string, fieldValue: string): Promise<any[]> {
  const snapshot = await firestore.collection(collectionName).where(fieldName, '==', fieldValue).get();
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

// Helper to query with conditions
export async function getDocsByQuery(queryObj: any): Promise<any[]> {
  const snapshot = await queryObj.get();
  return snapshot.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() }));
}

// Build a query with where conditions
export function buildQuery(collectionName: string, conditions: Array<{field: string, op: string, value: any}>): any {
  let q: any = firestore.collection(collectionName);
  for (const cond of conditions) {
    q = q.where(cond.field, cond.op, cond.value);
  }
  return q;
}
