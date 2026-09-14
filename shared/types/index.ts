/**
 * TypeScript Type Definitions for Creator Collaboration Intelligence Platform
 */

export type UserRole = 'seeker' | 'collaborator' | 'admin';

export type CommunicationStyle =
  | 'fast_decider'
  | 'detail_reviewer'
  | 'autonomous_executor'
  | 'collaborative_brainstormer';

export type OwnershipStatus = 'owned' | 'rented';

export type MediaType = 'video' | 'pdf' | 'image' | 'audio' | 'link';

export type MatchStatus =
  | 'pending_admin'
  | 'approved'
  | 'accepted'
  | 'counter_offered'
  | 'rejected';

export interface GearItem {
  id: string;
  equipmentName: string;
  category: string; // "Camera", "Lenses", "Lighting", "Audio", "Grip", "Drone"
  ownershipStatus: OwnershipStatus;
  specsNotes?: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  description?: string;
  linkUrl?: string; // YouTube, Vimeo, Behance
  rawFileUrl?: string;
  mediaType: MediaType;
  tags: string[];
}

export interface WorkLink {
  id: string;
  title: string;
  url: string;
  platform: 'youtube' | 'vimeo' | 'behance' | 'dribbble' | 'github' | 'website' | 'other';
  thumbnailUrl?: string;
}

export interface SocialLinks {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  pinterest?: string;
  twitter?: string;
  custom?: string;
}

export interface CreatorProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  bio?: string;
  primaryRole: string;
  secondaryRoles: string[];
  seekingRoles: string[]; // Roles user is looking for (e.g., ["Sound Designer", "Video Editor"])
  location: string;
  travelRadiusMiles: number;
  dayRateUsd: number;
  hourlyRateUsd?: number;
  pastBudgetTiers: string[]; // ["micro_budget", "indie", "commercial", "studio"]
  communicationStyle: CommunicationStyle;
  gearItems: GearItem[];
  portfolios: PortfolioItem[];
  workLinks: WorkLink[];
  socialLinks: SocialLinks;
  userRole: UserRole;
  profileCompleted?: boolean;
  createdAt?: string;

  // Collaborator Exchange & Verification Requirements
  unionStatus?: 'Union (IATSE / DGA / Local 600)' | 'Non-Union' | 'Both / Fi-Core';
  yearsExperience?: number;
  specialtyTags?: string[];
  cameraBodyVerified?: string;
  lensMount?: string;
  lightingWattage?: string;
  audioKitSpecs?: string;
  backupKitAvailable?: boolean;
  insuranceCoiReady?: boolean;
  passportValid?: boolean;
  willFly?: boolean;
  overtimeHourlyRate?: number;
  kitFeeIncluded?: boolean;
  depositTerms?: string;
  preferredChannel?: 'WhatsApp' | 'Slack' | 'Email' | 'Phone';
  emergencyContact?: string;
  nextAvailabilityDate?: string;
}

export interface RoleRequirement {
  roleTitle: string;
  quantity: number;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  estimatedDayRateUsd?: number;
}

export interface GearRequirement {
  category: string;
  itemOrSpecs: string;
  mandatory: boolean;
}

export interface ParsedProjectBrief {
  projectTitle: string;
  genre: string;
  tone: string;
  targetBudgetTier: string;
  estimatedBudgetUsd: number;
  shootDatesWindow: string;
  shootDurationDays: number;
  locationRequirement: string;
  rolesNeeded: RoleRequirement[];
  gearDependencies: GearRequirement[];
  dynamicIntentSummary: string;
}

export interface Project {
  id: string;
  seekerId: string;
  title: string;
  rawTextBrief: string;
  parsedRequirements: ParsedProjectBrief;
  budgetUsd: number;
  timeline: string;
  location: string;
  genreTags: string[];
  createdAt: string;
  seeker?: CreatorProfile;
  collaboratorIds?: string[];
  collaborators?: CreatorProfile[];
}

export interface ScoreLayerBreakdown {
  explicitSkillsScore: number;
  portfolioMetadataScore: number;
  dynamicIntentScore: number;
  budgetGearConstraintsScore: number;
  outcomeFeedbackScore: number;
}

export interface Match {
  id: string;
  projectId: string;
  seekerId: string;
  collaboratorId: string;
  bidirectionalScore: number;
  seekerFitScore: number;
  collaboratorFitScore: number;
  scoreBreakdown: ScoreLayerBreakdown;
  whyTheyFitProject: string[];
  whyProjectFitsThem: string[];
  status: MatchStatus;
  adminNotes?: string;
  counterOfferNotes?: string;
  createdAt: string;
  collaborator?: CreatorProfile;
  project?: Project;
  seeker?: CreatorProfile;
}

export interface AuthSession {
  userId: string;
  username: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  jwtToken: string;
  isNewUser?: boolean;
  profileCompleted?: boolean;
}

export interface BriefParseRequest {
  rawBriefText: string;
  optionalLocationHint?: string;
  optionalBudgetHint?: number;
}

export interface AdminApprovalRequest {
  status: MatchStatus;
  adminNotes?: string;
  manualScoreOverride?: number;
}

export interface ShotItem {
  id: string;
  sceneNumber: string;
  shotNumber: string;
  shotType: 'Wide' | 'Medium' | 'Close-Up' | 'Extreme Close-Up' | 'Over-the-Shoulder' | 'POV' | 'Aerial';
  focalLength: string;
  cameraMovement: 'Static' | 'Handheld' | 'Steadicam / Gimbal' | 'Dolly Track' | 'Technocrane' | 'Drone';
  description: string;
  lightingSetup: string;
  audioNotes: string;
  setupTimeMinutes: number;
  isCompleted: boolean;
}

export interface BudgetItem {
  id: string;
  category: 'Above-the-Line' | 'Camera & Grip Crew' | 'Sound Dept' | 'Equipment Package' | 'Locations & Permits' | 'Post-Production' | 'Contingency';
  item: string;
  ratePerUnit: number;
  unit: 'day' | 'flat' | 'item' | 'hr';
  quantity: number;
  totalUsd: number;
  assignedCollaboratorId?: string;
}

export interface CallSheetCrewMember {
  id: string;
  name: string;
  role: string;
  callTime: string;
  phone: string;
  department: string;
  isConfirmed: boolean;
}

export interface CallSheet {
  id: string;
  projectId: string;
  shootDayNumber: number;
  totalShootDays: number;
  shootDate: string;
  generalCallTime: string;
  locationName: string;
  locationAddress: string;
  parkingNotes: string;
  nearestHospital: string;
  hospitalPhone: string;
  weatherForecast: string;
  sunriseTime: string;
  sunsetTime: string;
  specialInstructions: string;
  scheduleEvents: {
    time: string;
    event: string;
    description?: string;
  }[];
  crewList: CallSheetCrewMember[];
}

export interface ProjectWorkspace {
  projectId: string;
  projectTitle: string;
  matchedCollaborator?: CreatorProfile;
  matchScore: number;
  shotList: ShotItem[];
  budgetItems: BudgetItem[];
  callSheet: CallSheet;
}

export * from './explore';
export * from './assistant';
