import { Router } from 'express';
import { ProfileService } from '../services/profileService';
import { PROFESSIONS, GENRES } from '../constants/professions';
import { getOnboardingForProfessions, PROFESSION_ONBOARDING } from '../constants/onboarding';
import { seedDemoCreators, isFirestoreEnabled } from '../services/dataStore';

export const profileRoutes = Router();

/** Resolve userId from header or query (Firebase token later; for now compatible with existing app) */
function resolveUserId(req: any): string | null {
  const h = req.headers['x-user-id'] || req.headers['x-userid'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.query.userId === 'string') return req.query.userId;
  if (typeof req.body?.userId === 'string') return req.body.userId;
  return null;
}

// GET /api/skills  &  GET /api/interests  (catalog)
profileRoutes.get('/skills', (_req, res) => {
  // catalog of common skill keys; values are set per-user
  res.json({
    skills: [
      'direction',
      'screenwriting',
      'editing',
      'cinematography',
      'lighting',
      'color_grading',
      'sound_design',
      'sound_recording',
      'producing',
      'camera',
      'gimbal',
      'drone',
      'photography',
    ],
  });
});

profileRoutes.get('/interests', (_req, res) => {
  res.json({ interests: [...GENRES] });
});

profileRoutes.get('/professions', (_req, res) => {
  res.json({ professions: PROFESSIONS });
});

/** Full profession onboarding question sets (spec §3) */
profileRoutes.get('/onboarding/professions', (_req, res) => {
  res.json({ onboarding: PROFESSION_ONBOARDING });
});

profileRoutes.get('/onboarding/for', (req, res) => {
  const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  res.json({ steps: getOnboardingForProfessions(ids) });
});

/** Seed demo creators for client demos (Bhopal + Mumbai) */
profileRoutes.post('/admin/seed-demo-creators', async (_req, res) => {
  try {
    const result = await seedDemoCreators();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Seed failed' });
  }
});

profileRoutes.get('/admin/data-mode', (_req, res) => {
  res.json({
    mode: isFirestoreEnabled() ? 'firestore' : 'memory',
    hint: isFirestoreEnabled()
      ? 'Using real Firestore'
      : 'Set FIREBASE_SERVICE_ACCOUNT_JSON to use Firestore',
  });
});

// Users
profileRoutes.get('/users/me', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required (x-user-id header or ?userId=)' });
    return;
  }
  const profile = ProfileService.getMe(userId);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(profile);
});

profileRoutes.patch('/users/me', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const updated = ProfileService.updateMe(userId, req.body || {});
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(updated);
});

// Profiles (same data for now — source of truth is user doc)
profileRoutes.get('/profiles/me', async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  try {
    if (isFirestoreEnabled()) {
      const fsUser = await getUser(userId);
      if (fsUser) {
        res.json(toPublicProfile(fsUser as any));
        return;
      }
    }
  } catch (e) {
    console.warn('[profiles/me] firestore read failed', e);
  }
  const profile = ProfileService.getMe(userId);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(profile);
});

profileRoutes.patch('/profiles/me', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const updated = ProfileService.updateMe(userId, req.body || {});
  if (!updated) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(updated);
});

profileRoutes.put('/profiles/me/skills', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const skills = req.body?.skills ?? req.body;
  if (!skills || typeof skills !== 'object') {
    res.status(400).json({ error: 'skills object required' });
    return;
  }
  const updated = ProfileService.putSkills(userId, skills);
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(updated);
});

profileRoutes.put('/profiles/me/interests', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const interests = req.body?.interests ?? req.body;
  if (!interests || typeof interests !== 'object') {
    res.status(400).json({ error: 'interests object required' });
    return;
  }
  const updated = ProfileService.putInterests(userId, interests);
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(updated);
});

profileRoutes.get('/profiles/me/availability', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const profile = ProfileService.getMe(userId);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ availability: (profile as any).availability || { status: 'available' } });
});

profileRoutes.put('/profiles/me/availability', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const availability = req.body?.availability ?? req.body;
  if (!availability || typeof availability !== 'object') {
    res.status(400).json({ error: 'availability object required' });
    return;
  }
  const updated = ProfileService.putAvailability(userId, availability);
  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(updated);
});

profileRoutes.post('/profiles/me/portfolio', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const item = req.body;
  if (!item || typeof item !== 'object') {
    res.status(400).json({ error: 'portfolio item required' });
    return;
  }
  const profile = ProfileService.getMe(userId);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const portfolio = Array.isArray((profile as any).portfolio)
    ? [...(profile as any).portfolio]
    : Array.isArray((profile as any).portfolios)
      ? [...(profile as any).portfolios]
      : [];
  const entry = {
    id: item.id || `port_${Date.now()}`,
    title: item.title || '',
    url: item.url || item.linkUrl || '',
    mediaType: item.mediaType || 'link',
    tags: item.tags || [],
  };
  portfolio.push(entry);
  const updated = ProfileService.updateMe(userId, { portfolios: portfolio });
  res.json(updated);
});

profileRoutes.delete('/profiles/me/portfolio/:id', (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const profile = ProfileService.getMe(userId);
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const portfolio = (
    Array.isArray((profile as any).portfolio)
      ? (profile as any).portfolio
      : (profile as any).portfolios || []
  ).filter((p: any) => p.id !== req.params.id);
  const updated = ProfileService.updateMe(userId, { portfolios: portfolio });
  res.json(updated);
});

profileRoutes.post('/profiles/me/embed', async (req, res) => {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'userId required' });
    return;
  }
  const result = await ProfileService.refreshEmbedding(userId);
  res.json(result);
});
