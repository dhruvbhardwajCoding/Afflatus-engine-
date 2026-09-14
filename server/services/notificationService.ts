/**
 * Notifications owned by Main Backend (spec §31).
 * In-memory store for now; FCM push can plug into sendPush later.
 */
import { getDatabase, saveDatabase } from '../db';

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface DeviceRegistration {
  userId: string;
  token: string;
  platform?: string;
  updatedAt: string;
}

function ensure(db: any) {
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.deviceTokens)) db.deviceTokens = [];
}

export class NotificationService {
  static create(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }) {
    const db = getDatabase() as any;
    ensure(db);
    const n: AppNotification = {
      id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      read: false,
      createdAt: new Date().toISOString(),
    };
    db.notifications.push(n);
    saveDatabase(db);

    // Hook for FCM later:
    // this.sendPush(input.userId, input.title, input.body, input.data);
    return n;
  }

  static listForUser(userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    return (db.notifications as AppNotification[])
      .filter((n) => n.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static markRead(notificationId: string, userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    const idx = (db.notifications as AppNotification[]).findIndex(
      (n) => n.id === notificationId && n.userId === userId
    );
    if (idx < 0) return null;
    db.notifications[idx].read = true;
    saveDatabase(db);
    return db.notifications[idx];
  }

  static markAllRead(userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    for (const n of db.notifications as AppNotification[]) {
      if (n.userId === userId) n.read = true;
    }
    saveDatabase(db);
    return { ok: true };
  }

  static registerDevice(userId: string, token: string, platform?: string) {
    const db = getDatabase() as any;
    ensure(db);
    const list = db.deviceTokens as DeviceRegistration[];
    const idx = list.findIndex((d) => d.userId === userId && d.token === token);
    const entry: DeviceRegistration = {
      userId,
      token,
      platform,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    saveDatabase(db);
    return entry;
  }

  /** FCM push (Batch G). Needs firebase-admin + registered device tokens. */
  static async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) {
    const db = getDatabase() as any;
    ensure(db);
    const tokens = (db.deviceTokens as DeviceRegistration[])
      .filter((d) => d.userId === userId)
      .map((d) => d.token);
    if (!tokens.length) return { sent: false, reason: 'no_device_tokens' };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');
      if (!admin.apps?.length) return { sent: false, reason: 'firebase_admin_not_initialized' };
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data
          ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
          : undefined,
      });
      return { sent: true, successCount: res.successCount, failureCount: res.failureCount };
    } catch (err: any) {
      console.warn('[FCM] sendPush failed:', err?.message || err);
      return { sent: false, reason: err?.message || 'fcm_error' };
    }
  }
}
