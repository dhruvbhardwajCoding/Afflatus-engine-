import { Router } from 'express';
import { getAdminDb } from '../services/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { ChatService } from '../services/chatService';
import { QueryUnderstandingService } from '../services/queryUnderstandingService';
import { TemporaryChatService } from '../services/temporaryChatService';

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
 * POST /api/briefs/parse-v2
 * Uses QueryUnderstandingService to pull structured fields
 */
chatRoutes.post('/briefs/parse-v2', async (req, res) => {
  try {
    const text = req.body?.text || req.body?.brief || req.body?.message;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const understood = await QueryUnderstandingService.understandChat(text);
    if (!understood.success || !understood.data) {
      return res.status(502).json({
        error: 'Understanding failed',
        detail: understood.error,
      });
    }
    const d = understood.data;
    res.json({
      success: true,
      source: 'engine-gemini',
      projectTitle: d.project_type && d.project_type !== 'not_specified' ? `${d.project_type} project` : 'Parsed project',
      location: d.location?.city !== 'not_specified' ? d.location : null,
      projectType: d.project_type !== 'not_specified' ? d.project_type : null,
      requiredRoles: d.role !== 'not_specified' ? [d.role] : [],
      intent: 'brief_parse',
      raw: d,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Parse failed' });
  }
});

// ---------- Temporary Chat Sessions (User-to-User) ----------
chatRoutes.get('/temporary-chat/:connectionId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  const messages = TemporaryChatService.getMessages(req.params.connectionId);
  res.json({ messages });
});

chatRoutes.post('/temporary-chat/:connectionId', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  
  const recipientId = req.body?.recipientId;
  const text = req.body?.text;
  
  if (!recipientId || !text) {
    return res.status(400).json({ error: 'recipientId and text required' });
  }

  const message = TemporaryChatService.sendMessage({
    connectionId: req.params.connectionId,
    senderId: userId,
    recipientId,
    text
  });
  
  res.status(201).json({ message });
});

chatRoutes.post('/temporary-chat/:connectionId/read', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });
  TemporaryChatService.markRead(req.params.connectionId, userId);
  res.json({ success: true });
});

chatRoutes.post('/temporary-chat/:connectionId/collaborate', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });

  try {
    const { connectionId } = req.params;
    const { getDatabase, saveDatabase } = await import('../db');
    const db = getDatabase();
    
    const connection = db.connections.find(c => c.id === connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connection request not found.' });
    }
    
    if (connection.senderId !== userId && connection.recipientId !== userId) {
      return res.status(403).json({ error: 'You are not part of this connection.' });
    }

    const requestedBy = new Set((connection as any).collaborateRequestedBy || []);
    requestedBy.add(userId);
    const newRequestedBy = Array.from(requestedBy);
    
    const isUpgrading = newRequestedBy.length === 2 && connection.status === 'accepted';
    const newStatus = isUpgrading ? 'collaborating' : connection.status;

    (connection as any).collaborateRequestedBy = newRequestedBy;
    connection.status = newStatus as any;
    (connection as any).updatedAt = new Date().toISOString();
    
    if (isUpgrading) {
      const sender = db.users.find(u => u.id === connection.senderId);
      const recipient = db.users.find(u => u.id === connection.recipientId);
      
      if (sender) {
        sender.collaborationCount = (sender.collaborationCount || 0) + 1;
        if (!sender.experience) sender.experience = { years: 0, projectsCompleted: 0, tools: [] };
        sender.experience.projectsCompleted = (sender.experience.projectsCompleted || 0) + 1;
      }
      if (recipient) {
        recipient.collaborationCount = (recipient.collaborationCount || 0) + 1;
        if (!recipient.experience) recipient.experience = { years: 0, projectsCompleted: 0, tools: [] };
        recipient.experience.projectsCompleted = (recipient.experience.projectsCompleted || 0) + 1;
      }
    }

    saveDatabase(db);
    
    res.json({
      connection
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/**
 * POST /api/feedback/:targetUserId
 * Submit collaboration feedback (ratings) for another user.
 * Updates the target user's collaborationProfile with running averages.
 * Requires the caller to have an active collaboration with the target.
 */
chatRoutes.post('/feedback/:targetUserId', async (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'x-user-id required' });

  try {
    const { targetUserId } = req.params;
    const ratings: Record<string, number> = req.body?.ratings;

    if (!ratings || typeof ratings !== 'object' || Object.keys(ratings).length === 0) {
      return res.status(400).json({ error: 'ratings object required' });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ error: 'You cannot rate yourself.' });
    }

    const { getDatabase, saveDatabase } = await import('../db');
    const db = getDatabase();

    // Verify there's an active collaboration between the two users
    const hasCollaboration = db.connections.some(c => {
      if (['collaborating', 'completed'].includes(c.status)) {
        if ((c.senderId === userId && c.recipientId === targetUserId) ||
            (c.senderId === targetUserId && c.recipientId === userId)) {
          return true;
        }
      }
      return false;
    });
    
    const validConnectionDoc = db.connections.find(c => {
      if (['collaborating', 'completed'].includes(c.status)) {
        if ((c.senderId === userId && c.recipientId === targetUserId) ||
            (c.senderId === targetUserId && c.recipientId === userId)) {
          return true;
        }
      }
      return false;
    });

    if (!hasCollaboration || !validConnectionDoc) {
      return res.status(403).json({ error: 'You must have an active collaboration to leave feedback.' });
    }

    if ((validConnectionDoc as any).feedbackGivenBy && (validConnectionDoc as any).feedbackGivenBy.includes(userId)) {
      return res.status(409).json({ error: 'You have already submitted feedback for this collaboration.' });
    }

    // Get target user's current profile
    const targetUser = db.users.find(u => u.id === targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const currentProfile = targetUser.collaborationProfile || {
      creativity: 5,
      communication: 5,
      flexibility: 5,
      reliability: 5,
      teamwork: 5,
      feedback_openness: 5,
      leadership: 5,
      technical_proficiency: 5,
      feedbackCount: 0
    };

    const count = currentProfile.feedbackCount || 0;
    const newCount = count + 1;
    const updatedProfile = { ...currentProfile, feedbackCount: newCount };

    const PRIOR_WEIGHT = 3;
    const PRIOR_SCORE = 5.0;

    for (const trait of Object.keys(ratings)) {
      const oldScore = (currentProfile as any)[trait] || 5;
      const newScore = ratings[trait];
      const bayesianAverage = ((PRIOR_SCORE * PRIOR_WEIGHT) + (oldScore * count) + newScore) / (PRIOR_WEIGHT + count + 1);
      (updatedProfile as any)[trait] = Math.round(bayesianAverage * 10) / 10;
    }

    targetUser.collaborationProfile = updatedProfile as any;
    
    (validConnectionDoc as any).feedbackGivenBy = [...((validConnectionDoc as any).feedbackGivenBy || []), userId];

    saveDatabase(db);

    res.json({ success: true, collaborationProfile: updatedProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});
