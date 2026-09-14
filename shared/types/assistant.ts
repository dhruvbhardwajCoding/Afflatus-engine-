import type { CreatorProfile, Project, ProjectTask, WorkShowcase, CreativeClub } from './index';

export type AssistantIntent =
  | 'discover_creators'
  | 'discover_projects'
  | 'discover_tasks'
  | 'discover_works'
  | 'discover_clubs'
  | 'platform_guidance'
  | 'general_inquiry';

export interface AssistantAction {
  label: string;
  actionType: 'navigate_explore' | 'open_task' | 'open_project' | 'open_creator' | 'open_club' | 'filter_category';
  payload?: {
    tab?: 'all' | 'projects' | 'tasks' | 'works' | 'clubs' | 'creators';
    category?: string;
    search?: string;
    id?: string;
    item?: any;
  };
}

export interface AssistantMatchedItem {
  type: 'creator' | 'project' | 'task' | 'work' | 'club';
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  details?: string;
  avatarUrl?: string;
  rateOrBudget?: string;
  itemData?: CreatorProfile | Project | ProjectTask | WorkShowcase | CreativeClub;
}

export interface AssistantChatResponse {
  success: boolean;
  message: string;
  intent: AssistantIntent;
  suggestedActions?: AssistantAction[];
  matchedItems?: AssistantMatchedItem[];
  modelUsed?: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  intent?: AssistantIntent;
  matchedItems?: AssistantMatchedItem[];
  suggestedActions?: AssistantAction[];
  isError?: boolean;
}
