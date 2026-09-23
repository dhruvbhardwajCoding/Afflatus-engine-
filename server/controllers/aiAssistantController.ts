import type { Request, Response } from 'express';
import { QueryUnderstandingService } from '../services/queryUnderstandingService';
import { RecommendationService } from '../services/recommendationService';

export class AiAssistantController {
  /**
   * POST /api/assistant/chat
   */
  public static async chat(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { prompt, userId } = body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          success: false,
          error: 'Prompt is required and must be a non-empty string.',
        });
        return;
      }

      const sanitizedPrompt = prompt.trim().slice(0, 2000);

      // 1. Understand query
      const understood = await QueryUnderstandingService.understandChat(sanitizedPrompt);
      if (!understood.success || !understood.data) {
        res.status(500).json({ success: false, error: understood.error || 'Failed to understand query' });
        return;
      }

      const structured = understood.data;

      // 2. Deterministic scoring pipeline
      const search = await RecommendationService.searchFromRequirements(structured, userId);

      // 3. Shape output for existing UI
      res.json({
        success: true,
        intent: 'find_team', // default for V1
        structuredRequirements: structured,
        understandingSource: 'engine-gemini',
        message:
          search.results.length > 0
            ? `Found ${search.results.length} strong matches for your request.`
            : 'No strong matches after filters. Try broadening location or roles.',
        matchedItems: search.results.map((c) => ({
          id: c.creatorId,
          type: 'creator',
          score: c.score,
          matchReasons: c.reasons,
          title: c.profile.name,
          subtitle: c.profile.primaryRole,
          meta: {
            location: c.profile.location,
          },
        })),
        candidates: search.results,
      });
    } catch (err: any) {
      console.error('[AiAssistantController.chat] Error:', err);
      res.status(500).json({ success: false, error: 'Assistant processing encountered an issue.' });
    }
  }

  public static async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const suggestions = [
        { id: 's1', label: 'Find DPs in Mumbai', query: 'Find me a Director of Photography in Mumbai with cinema camera gear' },
        { id: 's2', label: 'Paid sound & audio gigs', query: 'Show me open paid tasks for sound design or location recording' },
        { id: 's3', label: 'Commercial fashion campaigns', query: 'Are there commercial fashion or editorial projects?' },
        { id: 's4', label: 'DaVinci Resolve video editors', query: 'Find video editors skilled in DaVinci Resolve and commercial rhythm' },
      ];
      res.json({ success: true, suggestions });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to retrieve suggestions.' });
    }
  }
}
