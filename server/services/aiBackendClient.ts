/**
 * Client for calling the AI Backend (internal).
 * Falls back gracefully if AI Backend is unreachable.
 */
import axios, { type AxiosInstance } from 'axios';

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || 'http://localhost:3001';
const INTERNAL_SECRET =
  process.env.INTERNAL_AI_SERVICE_SECRET || 'dev-internal-secret-change-me';

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: AI_BACKEND_URL,
    timeout: 25000,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET,
    },
  });
}

export class AiBackendClient {
  private static client = createClient();

  static async understandChat(message: string, context?: unknown) {
    try {
      const res = await this.client.post('/internal/chat/understand', {
        message,
        context,
      });
      return { ok: true as const, data: res.data?.data ?? res.data, source: res.data?.source };
    } catch (err: any) {
      console.warn('[AiBackendClient.understandChat] failed:', err?.message || err);
      return { ok: false as const, error: err?.message || 'AI Backend unreachable' };
    }
  }

  static async analyzeProfile(profile: unknown) {
    try {
      const res = await this.client.post('/internal/profile/analyze', { profile });
      return { ok: true as const, data: res.data?.data ?? res.data };
    } catch (err: any) {
      return { ok: false as const, error: err?.message || 'AI Backend unreachable' };
    }
  }

  static async embedProfile(text: string) {
    try {
      const res = await this.client.post('/internal/profile/embed', { text });
      return { ok: true as const, embedding: res.data?.embedding, source: res.data?.source };
    } catch (err: any) {
      return { ok: false as const, error: err?.message || 'AI Backend unreachable' };
    }
  }

  static async rankCandidates(candidates: unknown[], weights?: Record<string, number>) {
    try {
      const res = await this.client.post('/internal/recommendations/rank', {
        candidates,
        weights,
      });
      return {
        ok: true as const,
        ranked: res.data?.ranked ?? [],
        weights: res.data?.weights,
      };
    } catch (err: any) {
      return { ok: false as const, error: err?.message || 'AI Backend unreachable' };
    }
  }

  static async explainRecommendation(candidate: unknown, project?: unknown) {
    try {
      const res = await this.client.post('/internal/recommendations/explain', {
        candidate,
        project,
      });
      return {
        ok: true as const,
        matchReasons: res.data?.matchReasons ?? [],
        score: res.data?.score,
      };
    } catch (err: any) {
      return { ok: false as const, error: err?.message || 'AI Backend unreachable' };
    }
  }

  static async health() {
    try {
      const res = await this.client.get('/internal/health');
      return { ok: true as const, data: res.data };
    } catch {
      return { ok: false as const };
    }
  }
}
