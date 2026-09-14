import { Router } from 'express';
import { RecommendationService } from '../services/recommendationService';
import { AiBackendClient } from '../services/aiBackendClient';

export const recommendationRoutes = Router();

/**
 * POST /api/recommendations/search
 * Body: { location, projectType, genres, requiredRoles, availability, limit, excludeUserIds }
 */
recommendationRoutes.post('/search', async (req, res) => {
  try {
    const body = req.body || {};
    const requesterId =
      (typeof req.headers['x-user-id'] === 'string' && req.headers['x-user-id']) ||
      body.requesterId ||
      null;
    const result = await RecommendationService.search({
      location: body.location ?? null,
      projectType: body.projectType ?? null,
      genres: Array.isArray(body.genres) ? body.genres : [],
      requiredRoles: Array.isArray(body.requiredRoles) ? body.requiredRoles : [],
      availability: body.availability ?? null,
      limit: typeof body.limit === 'number' ? body.limit : 20,
      excludeUserIds: Array.isArray(body.excludeUserIds) ? body.excludeUserIds : [],
      requesterId,
    });

    res.json({
      success: true,
      candidates: result.candidates.map((c) => ({
        userId: c.userId,
        score: Math.round(c.score * 100) / 100,
        matchReasons: c.matchReasons,
        profile: {
          id: c.profile.id,
          name: c.profile.name,
          avatarUrl: c.profile.avatarUrl,
          primaryRole: c.profile.primaryRole,
          professions: (c.profile as any).professions,
          location: (c.profile as any).location || (c.profile as any).city,
          bio: c.profile.bio,
          availability: (c.profile as any).availability,
        },
      })),
      totalFiltered: result.totalFiltered,
      pipeline: result.pipeline,
    });
  } catch (err: any) {
    console.error('[recommendations/search]', err);
    res.status(500).json({ success: false, error: err?.message || 'Search failed' });
  }
});

/**
 * POST /api/recommendations/from-chat
 * Convenience: natural language → understand → search
 */
recommendationRoutes.post('/from-chat', async (req, res) => {
  try {
    const message = req.body?.message;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const understood = await AiBackendClient.understandChat(message, req.body?.context);
    if (!understood.ok) {
      res.status(502).json({
        error: 'AI Backend unavailable',
        detail: understood.error,
        hint: 'Start ai-backend on port 3001 or check INTERNAL_SERVICE_SECRET',
      });
      return;
    }

    const data = understood.data || {};
    const searchResult = await RecommendationService.search({
      location: data.location ?? null,
      projectType: data.projectType ?? null,
      genres: data.genres || [],
      requiredRoles: data.requiredRoles || [],
      availability: data.availability ?? null,
      limit: req.body?.limit || 15,
      excludeUserIds: req.body?.excludeUserIds || [],
    });

    res.json({
      success: true,
      understanding: data,
      understandingSource: understood.source,
      candidates: searchResult.candidates.map((c) => ({
        userId: c.userId,
        score: Math.round(c.score * 100) / 100,
        matchReasons: c.matchReasons,
        profile: {
          id: c.profile.id,
          name: c.profile.name,
          avatarUrl: c.profile.avatarUrl,
          primaryRole: c.profile.primaryRole,
          professions: (c.profile as any).professions,
          location: (c.profile as any).location || (c.profile as any).city,
          bio: c.profile.bio,
        },
      })),
      totalFiltered: searchResult.totalFiltered,
      pipeline: searchResult.pipeline,
    });
  } catch (err: any) {
    console.error('[recommendations/from-chat]', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed' });
  }
});
