import type { Request, Response } from 'express';
import { AiAssistantService } from '../services/aiAssistantService';
import { AiBackendClient } from '../services/aiBackendClient';
import { RecommendationService } from '../services/recommendationService';

export class AiAssistantController {
  /**
   * POST /api/assistant/chat
   * 1) Prefer AI Backend structured understanding
   * 2) Run recommendation pipeline when intent is find_team
   * 3) Fall back to existing AiAssistantService so current UI keeps working
   */
  public static async chat(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { prompt, userId, currentUserProfile } = body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          success: false,
          error: 'Prompt is required and must be a non-empty string.',
        });
        return;
      }

      const sanitizedPrompt = prompt.trim().slice(0, 2000);

      // --- New path: AI Backend understand + recommendation pipeline ---
      let structured: any = null;
      let structuredSource: string | null = null;
      try {
        const understood = await AiBackendClient.understandChat(sanitizedPrompt, {
          userId,
          currentUserProfile,
        });
        if (understood.ok && understood.data) {
          structured = understood.data;
          structuredSource = understood.source || 'ai-backend';
        }
      } catch {
        // ignore — fallback below
      }

      if (structured && structured.intent === 'find_team' && Array.isArray(structured.requiredRoles)) {
        const search = await RecommendationService.search({
          location: structured.location ?? null,
          projectType: structured.projectType ?? null,
          genres: structured.genres || [],
          requiredRoles: structured.requiredRoles || [],
          availability: structured.availability ?? null,
          limit: 12,
          excludeUserIds: userId ? [userId] : [],
        });

        // Shape compatible with existing assistant UI where possible
        res.json({
          success: true,
          intent: structured.intent,
          structuredRequirements: structured,
          understandingSource: structuredSource,
          message:
            search.candidates.length > 0
              ? `Found ${search.candidates.length} strong matches for your request.`
              : 'No strong matches after filters. Try broadening location or roles.',
          matchedItems: search.candidates.map((c) => ({
            id: c.userId,
            type: 'creator',
            score: c.score,
            matchReasons: c.matchReasons,
            title: c.profile.name,
            subtitle: c.profile.primaryRole,
            meta: {
              location: (c.profile as any).location || (c.profile as any).city,
              professions: (c.profile as any).professions,
            },
          })),
          candidates: search.candidates,
          pipeline: search.pipeline,
          totalFiltered: search.totalFiltered,
        });
        return;
      }

      // --- Legacy path (keeps existing Gemini assistant behaviour) ---
      const result = await AiAssistantService.processQuery({
        prompt: sanitizedPrompt,
        userId: typeof userId === 'string' ? userId : undefined,
        currentUserProfile:
          currentUserProfile && typeof currentUserProfile === 'object' ? currentUserProfile : null,
      });

      // Attach structured understanding when available
      if (structured) {
        (result as any).structuredRequirements = structured;
        (result as any).understandingSource = structuredSource;
      }

      res.json(result);
    } catch (err: any) {
      console.error('[AiAssistantController.chat] Unexpected error:', err);
      res.status(500).json({
        success: false,
        error: 'Assistant processing encountered an unexpected issue. Please try again.',
      });
    }
  }

  /**
   * GET /api/assistant/suggestions
   * Returns quick suggestion pills based on user role or platform offerings
   */
  public static async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const suggestions = [
        { id: 's1', label: 'Find DPs in Mumbai', query: 'Find me a Director of Photography in Mumbai with cinema camera gear' },
        { id: 's2', label: 'Paid sound & audio gigs', query: 'Show me open paid tasks for sound design or location recording' },
        { id: 's3', label: 'Commercial fashion campaigns', query: 'Are there commercial fashion or editorial projects?' },
        { id: 's4', label: 'DaVinci Resolve video editors', query: 'Find video editors skilled in DaVinci Resolve and commercial rhythm' },
        { id: 's5', label: 'Creative clubs & guilds', query: 'What creative clubs or filmmaker guilds can I join?' },
      ];

      res.json({ success: true, suggestions });
    } catch (err) {
      console.error('[AiAssistantController.getSuggestions] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve suggestions.' });
    }
  }
}
