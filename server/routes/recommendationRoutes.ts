import { Router } from 'express';
import { QueryUnderstandingService } from '../services/queryUnderstandingService';
import { RecommendationService } from '../services/recommendationService';

export const recommendationRoutes = Router();

/**
 * POST /api/recommendations/search
 * Direct search bypasses chat understanding
 */
recommendationRoutes.post('/search', async (req, res) => {
  try {
    const body = req.body || {};
    const requesterId = (typeof req.headers['x-user-id'] === 'string' && req.headers['x-user-id']) || body.requesterId || null;
    
    // Minimal mock structured requirements from body
    const requirements = {
      location: body.location ? { city: body.location } : 'not_specified',
      role: body.requiredRoles && body.requiredRoles.length > 0 ? body.requiredRoles[0] : 'not_specified',
      project_type: body.projectType || 'not_specified'
    };

    const result = await RecommendationService.searchFromRequirements(requirements, requesterId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[recommendations/search]', err);
    res.status(500).json({ success: false, error: err?.message || 'Search failed' });
  }
});

/**
 * POST /api/recommendations/ai-match
 * Understands conversational queries with history
 */
recommendationRoutes.post('/ai-match', async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }

    const understood = await QueryUnderstandingService.understandChat(messages);
    if (!understood.success || !understood.data) {
      res.status(500).json({ error: understood.error || 'Failed to understand query' });
      return;
    }

    const data = understood.data;
    const requesterId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : undefined;
    const searchResult = await RecommendationService.searchFromRequirements(data, requesterId);

    res.json({
      success: true,
      understanding: data,
      understandingSource: 'engine-gemini',
      candidates: searchResult.results.map(c => ({
        userId: c.creatorId,
        score: c.score,
        matchReasons: c.reasons,
        profile: c.profile
      })),
    });
  } catch (err: any) {
    console.error('[recommendations/ai-match]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed' });
  }
});
