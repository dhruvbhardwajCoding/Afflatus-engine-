/**
 * Chat conversations + messages (spec §29).
 * Flow: save user message → AI understand → optional recommendation → save AI message.
 */
import { getDatabase, saveDatabase } from '../db';
import { AiBackendClient } from './aiBackendClient';
import { RecommendationService } from './recommendationService';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  structured?: unknown;
  candidates?: unknown[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function ensure(db: any) {
  if (!Array.isArray(db.conversations)) db.conversations = [];
  if (!Array.isArray(db.messages)) db.messages = [];
}

export class ChatService {
  static listConversations(userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    return (db.conversations as Conversation[])
      .filter((c) => c.userId === userId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  static createConversation(userId: string, title?: string) {
    const db = getDatabase() as any;
    ensure(db);
    const c: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title: title || 'New conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.conversations.push(c);
    saveDatabase(db);
    return c;
  }

  static getConversation(conversationId: string, userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    const c = (db.conversations as Conversation[]).find(
      (x) => x.id === conversationId && x.userId === userId
    );
    return c || null;
  }

  static getMessages(conversationId: string, userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    const c = this.getConversation(conversationId, userId);
    if (!c) return null;
    return (db.messages as ChatMessage[])
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }

  static async postMessage(conversationId: string, userId: string, content: string) {
    const db = getDatabase() as any;
    ensure(db);
    const cIdx = (db.conversations as Conversation[]).findIndex(
      (x) => x.id === conversationId && x.userId === userId
    );
    if (cIdx < 0) return { error: 'not_found' as const };

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(userMsg);

    // AI understand
    const understood = await AiBackendClient.understandChat(content, { userId, conversationId });
    let structured = understood.ok ? understood.data : null;
    let candidates: any[] = [];
    let assistantText = 'I understood your request.';

    if (structured?.intent === 'find_team' && Array.isArray(structured.requiredRoles)) {
      const search = await RecommendationService.search({
        location: structured.location ?? null,
        projectType: structured.projectType ?? null,
        genres: structured.genres || [],
        requiredRoles: structured.requiredRoles || [],
        availability: structured.availability ?? null,
        limit: 10,
        excludeUserIds: [userId],
        requesterId: userId,
      });
      candidates = search.candidates.map((c) => ({
        userId: c.userId,
        score: Math.round(c.score * 100) / 100,
        matchReasons: c.matchReasons,
        name: c.profile.name,
        primaryRole: c.profile.primaryRole,
        location: (c.profile as any).location || (c.profile as any).city,
      }));
      assistantText =
        candidates.length > 0
          ? `Found ${candidates.length} candidates for ${structured.requiredRoles.join(', ')}${
              structured.location ? ` in ${structured.location}` : ''
            }.`
          : 'No strong matches after filters. Try a broader location or different roles.';
    } else if (structured) {
      assistantText = `Got it (intent: ${structured.intent || 'general'}). Tell me the roles, city, and project type if you want team recommendations.`;
    } else {
      assistantText =
        'AI Backend is offline — I saved your message. Start ai-backend for structured understanding.';
    }

    const aiMsg: ChatMessage = {
      id: `msg_${Date.now()}_a`,
      conversationId,
      role: 'assistant',
      content: assistantText,
      structured: structured || undefined,
      candidates: candidates.length ? candidates : undefined,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(aiMsg);

    // update conversation title from first message
    const conv = db.conversations[cIdx];
    if (conv.title === 'New conversation') {
      conv.title = content.slice(0, 60) + (content.length > 60 ? '…' : '');
    }
    conv.updatedAt = new Date().toISOString();
    db.conversations[cIdx] = conv;
    saveDatabase(db);

    return {
      userMessage: userMsg,
      assistantMessage: aiMsg,
      structured,
      candidates,
    };
  }
}
