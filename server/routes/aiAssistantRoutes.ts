import { Router } from 'express';
import { AiAssistantController } from '../controllers/aiAssistantController';

export const assistantRoutes = Router();

// POST /api/assistant/chat - Main AI conversation & discovery endpoint
assistantRoutes.post('/chat', AiAssistantController.chat);

// GET /api/assistant/suggestions - Contextual suggestion chips
assistantRoutes.get('/suggestions', AiAssistantController.getSuggestions);
