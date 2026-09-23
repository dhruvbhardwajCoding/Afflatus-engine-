import { getAdminDb } from './server/services/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
console.log("DB:", getAdminDb() ? "exists" : "null");
console.log("FieldValue:", FieldValue.serverTimestamp() ? "exists" : "null");
