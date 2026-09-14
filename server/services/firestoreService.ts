/**
 * Firestore access via Firebase Admin (replaces in-memory JSON when configured).
 * Collections align with product spec:
 *   users, projects, invitations, notifications, collaborations, conversations, messages
 */
import { isFirebaseAdminReady } from './firebaseAdmin';

let db: any = null;

function getDb() {
  if (db) return db;
  if (!isFirebaseAdminReady()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    db = admin.firestore();
    return db;
  } catch {
    return null;
  }
}

export function isFirestoreEnabled(): boolean {
  return Boolean(getDb());
}

export async function fsGet<T = any>(collection: string, id: string): Promise<T | null> {
  const database = getDb();
  if (!database) return null;
  const snap = await database.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export async function fsSet(collection: string, id: string, data: Record<string, unknown>, merge = true) {
  const database = getDb();
  if (!database) throw new Error('Firestore not configured');
  await database.collection(collection).doc(id).set(
    { ...data, updatedAt: new Date().toISOString() },
    { merge }
  );
  return { id, ...data };
}

export async function fsAdd(collection: string, data: Record<string, unknown>) {
  const database = getDb();
  if (!database) throw new Error('Firestore not configured');
  const ref = await database.collection(collection).add({
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { id: ref.id, ...data };
}

export async function fsUpdate(collection: string, id: string, data: Record<string, unknown>) {
  const database = getDb();
  if (!database) throw new Error('Firestore not configured');
  await database.collection(collection).doc(id).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
  return { id, ...data };
}

export async function fsDelete(collection: string, id: string) {
  const database = getDb();
  if (!database) throw new Error('Firestore not configured');
  await database.collection(collection).doc(id).delete();
  return { ok: true };
}

export async function fsQuery(
  collection: string,
  filters: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp | string; value: unknown }> = [],
  limitCount = 100
): Promise<any[]> {
  const database = getDb();
  if (!database) return [];
  let q: any = database.collection(collection);
  for (const f of filters) {
    q = q.where(f.field, f.op, f.value);
  }
  q = q.limit(limitCount);
  const snap = await q.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

export async function fsList(collection: string, limitCount = 200): Promise<any[]> {
  const database = getDb();
  if (!database) return [];
  const snap = await database.collection(collection).limit(limitCount).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}
