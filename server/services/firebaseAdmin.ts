/**
 * Firebase Admin (Batch D) — optional.
 * If GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON is set,
 * verifies ID tokens. Otherwise falls back to x-user-id (dev mode).
 */
import type { Request } from 'express';

let adminApp: any = null;
let adminAuth: any = null;
let initAttempted = false;

export function isFirebaseAdminReady(): boolean {
  ensureInit();
  return Boolean(adminAuth);
}

function ensureInit() {
  if (initAttempted) return;
  initAttempted = true;
  try {
    // Dynamic require so the package is optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    if (admin.apps?.length) {
      adminApp = admin.app();
    } else {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (json) {
        const cred = JSON.parse(json);
        adminApp = admin.initializeApp({ credential: admin.credential.cert(cred) });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        adminApp = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      } else {
        console.warn(
          '[FirebaseAdmin] Not configured — using x-user-id dev auth. Set FIREBASE_SERVICE_ACCOUNT_JSON to enable token verify.'
        );
        return;
      }
    }
    adminAuth = admin.auth();
    console.log('[FirebaseAdmin] Ready');
  } catch (err: any) {
    console.warn('[FirebaseAdmin] Init skipped:', err?.message || err);
  }
}

/** Verify Bearer token → uid, or null */
export async function verifyIdToken(req: Request): Promise<string | null> {
  ensureInit();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || !adminAuth) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid as string;
  } catch (err: any) {
    console.warn('[FirebaseAdmin] Token verify failed:', err?.message || err);
    return null;
  }
}

/**
 * Resolve user id: Firebase token first, then x-user-id.
 */
export async function resolveUserIdAsync(req: Request): Promise<string | null> {
  const fromToken = await verifyIdToken(req);
  if (fromToken) return fromToken;
  const h = req.headers['x-user-id'] || req.headers['x-userid'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.query.userId === 'string') return req.query.userId;
  if (typeof (req.body as any)?.userId === 'string') return (req.body as any).userId;
  return null;
}
