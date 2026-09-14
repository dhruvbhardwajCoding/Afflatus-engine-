import { Router } from 'express';
import { ProjectService } from '../services/projectService';
import { ExperienceService } from '../services/experienceService';
import { CollaborationService } from '../services/collaborationService';
import { NotificationService } from '../services/notificationService';

export const projectRoutes = Router();

function uid(req: any): string | null {
  const h = req.headers['x-user-id'] || req.headers['x-userid'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.query.userId === 'string') return req.query.userId;
  if (typeof req.body?.userId === 'string') return req.body.userId;
  return null;
}

// ---------- Projects ----------
projectRoutes.post('/projects', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const project = ProjectService.create(userId, req.body || {});
  res.status(201).json(project);
});

projectRoutes.get('/projects', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({ projects: ProjectService.listForUser(userId) });
});

projectRoutes.get('/projects/:projectId', (req, res) => {
  const p = ProjectService.getById(req.params.projectId);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json(p);
});

projectRoutes.patch('/projects/:projectId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.update(req.params.projectId, userId, req.body || {});
  if (!result) return res.status(404).json({ error: 'Project not found' });
  if ((result as any).error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });
  res.json(result);
});

projectRoutes.delete('/projects/:projectId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.remove(req.params.projectId, userId);
  if (!result) return res.status(404).json({ error: 'Project not found' });
  if ((result as any).error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });
  res.json({ success: true });
});

projectRoutes.get('/projects/:projectId/members', (req, res) => {
  const members = ProjectService.getMembers(req.params.projectId);
  if (!members) return res.status(404).json({ error: 'Project not found' });
  res.json({ members });
});

projectRoutes.post('/projects/:projectId/members', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const memberId = req.body?.userId || req.body?.memberId;
  if (!memberId) return res.status(400).json({ error: 'memberId required' });
  const result = ProjectService.addMember(req.params.projectId, userId, memberId);
  if (!result) return res.status(404).json({ error: 'Project not found' });
  if ((result as any).error) return res.status(403).json(result);
  res.json(result);
});

projectRoutes.delete('/projects/:projectId/members/:userId', (req, res) => {
  const ownerId = uid(req);
  if (!ownerId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.removeMember(req.params.projectId, ownerId, req.params.userId);
  if (!result) return res.status(404).json({ error: 'Project not found' });
  if ((result as any).error) return res.status(403).json(result);
  res.json(result);
});

projectRoutes.post('/projects/:projectId/complete', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.completeProject(req.params.projectId, userId);
  if (!result) return res.status(404).json({ error: 'Project not found' });
  if ((result as any).error) return res.status(403).json(result);
  res.json(result);
});

// ---------- Invitations ----------
projectRoutes.post('/projects/:projectId/invitations', (req, res) => {
  const inviterId = uid(req);
  if (!inviterId) return res.status(401).json({ error: 'x-user-id required' });
  const inviteeId = req.body?.inviteeId || req.body?.userId;
  if (!inviteeId) return res.status(400).json({ error: 'inviteeId required' });
  const result = ProjectService.createInvitation({
    projectId: req.params.projectId,
    inviterId,
    inviteeId,
    role: req.body?.role,
    message: req.body?.message,
  });
  if ((result as any).error) {
    const code = (result as any).error === 'forbidden' ? 403 : 404;
    return res.status(code).json(result);
  }
  res.status(201).json(result);
});

projectRoutes.get('/invitations', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({ invitations: ProjectService.listInvitationsForUser(userId) });
});

projectRoutes.post('/invitations/:invitationId/accept', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.acceptInvitation(req.params.invitationId, userId);
  if ((result as any).error) {
    const e = (result as any).error;
    const code = e === 'forbidden' ? 403 : e === 'not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

projectRoutes.post('/invitations/:invitationId/reject', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ProjectService.rejectInvitation(req.params.invitationId, userId);
  if ((result as any).error) {
    const e = (result as any).error;
    const code = e === 'forbidden' ? 403 : e === 'not_found' ? 404 : 400;
    return res.status(code).json(result);
  }
  res.json(result);
});

// ---------- Past projects / experience (profile history) ----------
projectRoutes.get('/profiles/me/projects', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({
    pastProjects: ExperienceService.getPastProjects(userId),
    experience: ExperienceService.recalculate(userId),
  });
});

projectRoutes.post('/profiles/me/projects', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ExperienceService.addPastProject(userId, req.body || {});
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.status(201).json(result);
});

projectRoutes.patch('/profiles/me/projects/:projectId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ExperienceService.updatePastProject(userId, req.params.projectId, req.body || {});
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

projectRoutes.delete('/profiles/me/projects/:projectId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const result = ExperienceService.deletePastProject(userId, req.params.projectId);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

// ---------- Notifications ----------
projectRoutes.post('/notifications/register-device', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: 'token required' });
  const entry = NotificationService.registerDevice(userId, token, req.body?.platform);
  res.json(entry);
});

projectRoutes.get('/notifications', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({ notifications: NotificationService.listForUser(userId) });
});

projectRoutes.post('/notifications/:id/read', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const n = NotificationService.markRead(req.params.id, userId);
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json(n);
});

projectRoutes.post('/notifications/read-all', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json(NotificationService.markAllRead(userId));
});

// ---------- Collaboration graph ----------
projectRoutes.get('/collaborations/me', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({ collaborations: CollaborationService.listForUser(userId) });
});

projectRoutes.get('/collaborations/score', (req, res) => {
  const a = typeof req.query.userA === 'string' ? req.query.userA : null;
  const b = typeof req.query.userB === 'string' ? req.query.userB : null;
  if (!a || !b) return res.status(400).json({ error: 'userA and userB required' });
  res.json({ userA: a, userB: b, collaborationScore: CollaborationService.getScore(a, b) });
});

projectRoutes.post('/collaborations/feedback', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const otherId = req.body?.otherUserId;
  const rating = Number(req.body?.rating);
  if (!otherId || Number.isNaN(rating)) {
    return res.status(400).json({ error: 'otherUserId and rating required' });
  }
  const edge = CollaborationService.addFeedback(userId, otherId, Math.min(1, Math.max(0, rating)));
  res.json(edge);
});
