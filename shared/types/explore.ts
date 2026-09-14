import type { CreatorProfile, Project, ParsedProjectBrief } from './index';

export type ExploreCategory =
  | 'all'
  | 'cinematography'
  | 'directing'
  | 'production'
  | 'sound'
  | 'editing'
  | 'design';

export type ExploreItemType = 'work' | 'project' | 'task' | 'club' | 'creator';

export interface WorkShowcase {
  id: string;
  creatorId: string;
  projectId?: string;
  projectTitle?: string;
  title: string;
  description: string;
  mediaType: 'video' | 'image' | 'audio' | 'link';
  thumbnailUrl: string;
  linkUrl: string;
  platform: 'vimeo' | 'youtube' | 'behance' | 'dribbble' | 'soundcloud' | 'website';
  category: string;
  tags: string[];
  rolesInvolved: string[];
  appreciationCount: number;
  createdAt: string;
  creator?: CreatorProfile;
  collaboratorIds?: string[];
  collaborators?: CreatorProfile[];
}

export interface ProjectTask {
  id: string;
  projectId: string;
  projectTitle: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  requiredRole: string;
  requiredSkills: string[];
  dayRateInr: number;
  location: string;
  durationDays: number;
  deadline?: string;
  status: 'open' | 'in_review' | 'filled';
  createdAt: string;
  creator?: CreatorProfile;
}

export interface CreativeClub {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  location: string;
  memberCount: number;
  avatarUrl?: string;
  coverImageUrl?: string;
  leadCreatorId: string;
  leadCreator?: CreatorProfile;
  meetingCadence: string;
  activeProjectsCount: number;
  createdAt: string;
}

export interface ExploreCreatorItem extends CreatorProfile {
  discoveryReason?: string;
  relevanceScore?: number;
}

export interface ExploreFeedResponse {
  success: boolean;
  activeCategory: string;
  counts: {
    works: number;
    projects: number;
    tasks: number;
    clubs: number;
    creators: number;
  };
  featuredWorks: WorkShowcase[];
  projects: Project[];
  tasks: ProjectTask[];
  clubs: CreativeClub[];
  suggestedCreators: ExploreCreatorItem[];
}

export interface ExploreRelatedResponse {
  success: boolean;
  itemType: ExploreItemType;
  itemId: string;
  relatedCreators: CreatorProfile[];
  relatedProjects: Project[];
  relatedTasks: ProjectTask[];
  relatedClubs: CreativeClub[];
  relatedWorks?: WorkShowcase[];
}
