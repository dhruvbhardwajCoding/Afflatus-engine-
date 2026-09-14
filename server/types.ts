import type {
  CreatorProfile,
  Project,
  WorkShowcase,
  ProjectTask,
  CreativeClub,
  ExploreCreatorItem,
  ExploreCategory,
  ExploreItemType,
  ExploreFeedResponse,
  ExploreRelatedResponse,
  AssistantChatResponse,
  AssistantIntent,
  AssistantMatchedItem,
  AssistantAction,
} from '../shared/types/index';

export type {
  CreatorProfile,
  Project,
  WorkShowcase,
  ProjectTask,
  CreativeClub,
  ExploreCreatorItem,
  ExploreCategory,
  ExploreItemType,
  ExploreFeedResponse,
  ExploreRelatedResponse,
  AssistantChatResponse,
  AssistantIntent,
  AssistantMatchedItem,
  AssistantAction,
};

export type DBUser = CreatorProfile & {
  passwordHash?: string;
};

export interface DatabaseSchema {
  users: DBUser[];
  connections: Array<{
    id: string;
    senderId: string;
    recipientId: string;
    message: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string;
    projectId?: string;
    taskId?: string;
  }>;
  projects: Project[];
  tasks: ProjectTask[];
  clubs: CreativeClub[];
  workShowcases: WorkShowcase[];
  matches: any[];
  workspaces: Record<string, any>;
}
