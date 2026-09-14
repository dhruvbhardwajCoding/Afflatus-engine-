import type { Request, Response } from 'express';
import { AiAssistantService } from '../services/aiAssistantService';

export class AiAssistantController {
  /**
   * POST /api/assistant/chat
   * Interprets natural language prompt and grounds results against the real database
   */
  public static async chat(req: Request, res: Response): Promise<void> {
    try {
      // Defensive payload ingestion with fallback defaults
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { prompt, userId, currentUserProfile } = body;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          success: false,
          error: 'Prompt is required and must be a non-empty string.',
        });
        return;
      }

      // Input length guard
      const sanitizedPrompt = prompt.trim().slice(0, 2000);

      const result = await AiAssistantService.processQuery({
        prompt: sanitizedPrompt,
        userId: typeof userId === 'string' ? userId : undefined,
        currentUserProfile: currentUserProfile && typeof currentUserProfile === 'object' ? currentUserProfile : null,
      });

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
