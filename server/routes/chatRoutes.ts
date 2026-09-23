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
    const { getAdminDb } = await import('../services/firebaseAdmin');
    const db = getAdminDb();
    
    const connectionRef = db.collection('connections').doc(connectionId);
    const connectionDoc = await connectionRef.get();
    
    if (!connectionDoc.exists) {
      return res.status(404).json({ error: 'Connection request not found.' });
    }
    
    const connection = connectionDoc.data();
    
    if (connection.senderId !== userId && connection.recipientId !== userId) {
      return res.status(403).json({ error: 'You are not part of this connection.' });
    }

    const requestedBy = new Set(connection.collaborateRequestedBy || []);
    requestedBy.add(userId);
    const newRequestedBy = Array.from(requestedBy);
    
    const isUpgrading = newRequestedBy.length === 2 && connection.status === 'accepted';
    const newStatus = isUpgrading ? 'collaborating' : connection.status;

    await connectionRef.update({
      collaborateRequestedBy: newRequestedBy,
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
    
    if (isUpgrading) {
      const { FieldValue } = await import('firebase-admin/firestore');
      const senderRef = db.collection('users').doc(connection.senderId);
      const recipientRef = db.collection('users').doc(connection.recipientId);
      
      const incrementExp = {
        collaborationCount: FieldValue.increment(1),
        'experience.projectsCompleted': FieldValue.increment(1)
      };
      
      await Promise.all([
        senderRef.update(incrementExp).catch(() => {}),
        recipientRef.update(incrementExp).catch(() => {})
      ]);
    }

    res.json({
      connection: { ...connection, status: newStatus, collaborateRequestedBy: newRequestedBy }
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
    const ratings = req.body?.ratings;

    if (!ratings || typeof ratings !== 'object' || Object.keys(ratings).length === 0) {
      return res.status(400).json({ error: 'ratings object required' });
    }

    if (userId === targetUserId) {
      return res.status(400).json({ error: 'You cannot rate yourself.' });
    }

    const { getAdminDb } = await import('../services/firebaseAdmin');
    const { FieldValue } = await import('firebase-admin/firestore');
    const db = getAdminDb();

    // Verify there's an active collaboration between the two users
    const connectionsSnapshot = await db.collection('connections')
      .where('status', 'in', ['collaborating', 'completed'])
      .get();
      
    let validConnectionDocRef = null;
    let hasCollaboration = false;
    let feedbackGivenBy = [];
    
    for (const doc of connectionsSnapshot.docs) {
      const c = doc.data();
      if ((c.senderId === userId && c.recipientId === targetUserId) ||
          (c.senderId === targetUserId && c.recipientId === userId)) {
        hasCollaboration = true;
        validConnectionDocRef = doc.ref;
        feedbackGivenBy = c.feedbackGivenBy || [];
        break;
      }
    }

    if (!hasCollaboration || !validConnectionDocRef) {
      return res.status(403).json({ error: 'You must have an active collaboration to leave feedback.' });
    }

    if (feedbackGivenBy.includes(userId)) {
      return res.status(409).json({ error: 'You have already submitted feedback for this collaboration.' });
    }

    // Get target user's current profile
    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserDoc = await targetUserRef.get();
    
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'Target user not found.' });
    }
    
    const targetUser = targetUserDoc.data();

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

    // Bayesian prior: weight of 3 reviews at score 5.0
    const PRIOR_WEIGHT = 3;
    const PRIOR_SCORE = 5.0;

    for (const trait of Object.keys(ratings)) {
      const oldScore = currentProfile[trait] || 5;
      const newScore = ratings[trait];
      const bayesianAverage = ((PRIOR_SCORE * PRIOR_WEIGHT) + (oldScore * count) + newScore) / (PRIOR_WEIGHT + count + 1);
      updatedProfile[trait] = Math.round(bayesianAverage * 10) / 10;
    }

    const batch = db.batch();
    
    batch.update(targetUserRef, {
      collaborationProfile: updatedProfile
    });
    
    batch.update(validConnectionDocRef, {
      feedbackGivenBy: FieldValue.arrayUnion(userId)
    });
    
    await batch.commit();

    res.json({ success: true, collaborationProfile: updatedProfile });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});
