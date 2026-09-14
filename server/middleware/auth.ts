/**
 * Auth middleware (Batch D).
 * 1) Firebase ID token (Bearer) when Admin is configured
 * 2) Fallback: x-user-id header (dev / current UI)
 */
import type { Request, Response, NextFunction } from 'express';
import { resolveUserIdAsync } from '../services/firebaseAdmin';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function resolveUserId(req: Request): string | null {
  const h = req.headers['x-user-id'] || req.headers['x-userid'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.query.userId === 'string') return req.query.userId;
  if (typeof (req.body as any)?.userId === 'string') return (req.body as any).userId;
  return null;
}

export function softAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  resolveUserIdAsync(req)
    .then((id) => {
      req.userId = id || undefined;
      next();
    })
    .catch(() => {
      req.userId = resolveUserId(req) || undefined;
      next();
    });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  resolveUserIdAsync(req)
    .then((id) => {
      if (!id) {
        res.status(401).json({
          error: 'Unauthorized',
          hint: 'Pass Authorization: Bearer <Firebase ID token> or x-user-id header',
        });
        return;
      }
      req.userId = id;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: 'Unauthorized' });
    });
}
