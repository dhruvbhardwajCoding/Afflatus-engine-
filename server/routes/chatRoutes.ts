import { Router } from 'express';
import { ChatService } from '../services/chatService';
import { TeamRecommendationService } from '../services/teamRecommendationService';
import { AiBackendClient } from '../services/aiBackendClient';

export const chatRoutes = Router();

function uid(req: any): string | null {
  const h = req.headers['x-user-id'] || req.headers['x-userid'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (typeof req.query.userId === 'string') return req.query.userId;
  if (typeof req.body?.userId === 'string') return req.body.userId;
  return null;
}

// Conversations
chatRoutes.post('/chat/conversations', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const c = ChatService.createConversation(userId, req.body?.title);
  res.status(201).json(c);
});

chatRoutes.get('/chat/conversations', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  res.json({ conversations: ChatService.listConversations(userId) });
});

chatRoutes.get('/chat/conversations/:conversationId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const c = ChatService.getConversation(req.params.conversationId, userId);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

chatRoutes.get('/chat/conversations/:conversationId/messages', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const messages = ChatService.getMessages(req.params.conversationId, userId);
  if (!messages) return res.status(404).json({ error: 'Not found' });
  res.json({ messages });
});

chatRoutes.post('/chat/conversations/:conversationId/messages', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const content = req.body?.content || req.body?.message || req.body?.prompt;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content required' });
  }
  const result = await ChatService.postMessage(req.params.conversationId, userId, content.trim());
  if ((result as any).error) return res.status(404).json(result);
  res.json(result);
});

/**
 * POST /api/recommendations/team
 * Body: { location, genres, requiredRoles / roles, projectType, availability }
 */
chatRoutes.post('/recommendations/team', async (req, res) => {
  try {
    const body = req.body || {};
    const requesterId =
      (typeof req.headers['x-user-id'] === 'string' && req.headers['x-user-id']) ||
      body.requesterId ||
      null;
    const team = await TeamRecommendationService.recommendTeam({
      location: body.location ?? null,
      projectType: body.projectType ?? null,
      genres: Array.isArray(body.genres) ? body.genres : [],
      requiredRoles: body.requiredRoles || body.roles || [],
      roles: body.roles || body.requiredRoles || [],
      availability: body.availability ?? null,
      limit: 40,
      excludeUserIds: Array.isArray(body.excludeUserIds) ? body.excludeUserIds : [],
      requesterId,
    });
    res.json({ success: true, ...team });
  } catch (err: any) {
    console.error('[recommendations/team]', err);
    res.status(500).json({ success: false, error: err?.message || 'Team search failed' });
  }
});

/**
 * POST /api/briefs/parse-v2
 * Prefer AI Backend structured understand (does not remove legacy /api/briefs/parse)
 */
chatRoutes.post('/briefs/parse-v2', async (req, res) => {
  try {
    const text = req.body?.text || req.body?.brief || req.body?.message;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const understood = await AiBackendClient.understandChat(text, { mode: 'brief_parse' });
    if (!understood.ok) {
      return res.status(502).json({
        error: 'AI Backend unavailable',
        detail: understood.error,
      });
    }
    const d = understood.data || {};
    res.json({
      success: true,
      source: understood.source,
      projectTitle: d.projectType ? `${d.projectType} project` : 'Parsed project',
      location: d.location,
      projectType: d.projectType,
      genres: d.genres || [],
      requiredRoles: d.requiredRoles || [],
      availability: d.availability,
      intent: d.intent,
      raw: d,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Parse failed' });
  }
});
