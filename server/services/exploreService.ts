import {
  getAllUsers,
  getAllProjects,
  getAllTasks,
  getAllClubs,
  getAllWorkShowcases,
  getUserById,
  getProjectById,
  getTaskById,
  getClubById,
  getWorkShowcaseById,
  getCreatorPublicWorkAndProjects,
  addConnection,
} from '../db';
import type {
  ExploreFeedResponse,
  ExploreRelatedResponse,
  ExploreItemType,
  ExploreCreatorItem,
  Project,
  ProjectTask,
  CreativeClub,
  WorkShowcase,
  CreatorProfile,
} from '../types';

export class ExploreService {
  /**
   * Deterministically calculate relevance for a creator based on profile signals
   */
  private static calculateCreatorRelevance(
    candidate: CreatorProfile,
    currentUser?: CreatorProfile
  ): { score: number; reason: string } {
    if (!currentUser) {
      return { score: 50, reason: `Featured ${candidate.primaryRole} in ${candidate.location || 'India'}` };
    }

    let score = 20;
    const reasons: string[] = [];

    const userSeeking = (currentUser.seekingRoles || []).map((r) => r.toLowerCase());
    const candidatePrimary = candidate.primaryRole.toLowerCase();
    const candidateSecondary = (candidate.secondaryRoles || []).map((r) => r.toLowerCase());

    // 1. Role Match (User seeks candidate's craft)
    if (userSeeking.some((r) => candidatePrimary.includes(r) || r.includes(candidatePrimary))) {
      score += 40;
      reasons.push(`Direct role match for your seeking preference: ${candidate.primaryRole}`);
    } else if (userSeeking.some((r) => candidateSecondary.some((cs) => cs.includes(r) || r.includes(cs)))) {
      score += 25;
      reasons.push(`Skills match your collaborator needs`);
    }

    // 2. Mutual Seeking (Candidate also seeks user's role)
    const candidateSeeking = (candidate.seekingRoles || []).map((r) => r.toLowerCase());
    const userPrimary = (currentUser.primaryRole || '').toLowerCase();
    if (userPrimary && candidateSeeking.some((r) => userPrimary.includes(r) || r.includes(userPrimary))) {
      score += 20;
      reasons.push(`Actively seeking a ${currentUser.primaryRole}`);
    }

    // 3. Location Proximity
    if (currentUser.location && candidate.location && currentUser.location.toLowerCase() === candidate.location.toLowerCase()) {
      score += 15;
      reasons.push(`Based in ${candidate.location}`);
    }

    // 4. Equipment/Portfolio richness
    if (candidate.gearItems && candidate.gearItems.length > 0) {
      score += 10;
    }

    const mainReason = reasons.length > 0 ? reasons.join(' • ') : `Active ${candidate.primaryRole} available for collaborative work`;
    return { score, reason: mainReason };
  }

  /**
   * Returns filtered and ranked discovery feed
   */
  public static getExploreFeed(params: {
    userId?: string;
    category?: string;
    search?: string;
  }): ExploreFeedResponse {
    const currentUser = params.userId ? getUserById(params.userId) : undefined;
    const cat = (params.category || 'all').toLowerCase();
    const query = (params.search || '').trim().toLowerCase();

    // 1. Work Showcases
    let works = getAllWorkShowcases();
    if (cat !== 'all') {
      works = works.filter((w) => w.category.toLowerCase() === cat || w.tags.some((t) => t.toLowerCase() === cat));
    }
    if (query) {
      works = works.filter(
        (w) =>
          w.title.toLowerCase().includes(query) ||
          w.description.toLowerCase().includes(query) ||
          w.tags.some((t) => t.toLowerCase().includes(query)) ||
          w.rolesInvolved.some((r) => r.toLowerCase().includes(query)) ||
          (w.creator && w.creator.name.toLowerCase().includes(query))
      );
    }
    // Deterministic ranking for works
    works.sort((a, b) => {
      let scoreA = a.appreciationCount || 0;
      let scoreB = b.appreciationCount || 0;
      if (currentUser) {
        const userRole = (currentUser.primaryRole || '').toLowerCase();
        if (a.rolesInvolved?.some((r) => r.toLowerCase().includes(userRole))) scoreA += 50;
        if (b.rolesInvolved?.some((r) => r.toLowerCase().includes(userRole))) scoreB += 50;
      }
      return scoreB - scoreA;
    });

    // 2. Projects
    let projects = getAllProjects();
    if (cat !== 'all') {
      projects = projects.filter(
        (p) =>
          p.genreTags.some((g) => g.toLowerCase() === cat) ||
          p.parsedRequirements.rolesNeeded.some((r) => r.roleTitle.toLowerCase().includes(cat))
      );
    }
    if (query) {
      projects = projects.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.rawTextBrief.toLowerCase().includes(query) ||
          p.location.toLowerCase().includes(query) ||
          p.genreTags.some((g) => g.toLowerCase().includes(query)) ||
          (p.seeker && p.seeker.name.toLowerCase().includes(query))
      );
    }
    // Deterministic ranking for projects based on user profile and role requirements
    if (currentUser) {
      const userRole = (currentUser.primaryRole || '').toLowerCase();
      const userLocation = (currentUser.location || '').toLowerCase();
      projects.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        const aNeeds = a.parsedRequirements?.rolesNeeded || [];
        const bNeeds = b.parsedRequirements?.rolesNeeded || [];

        if (aNeeds.some((rn) => rn.roleTitle.toLowerCase().includes(userRole))) scoreA += 35;
        if (bNeeds.some((rn) => rn.roleTitle.toLowerCase().includes(userRole))) scoreB += 35;

        if (userLocation && a.location.toLowerCase().includes(userLocation)) scoreA += 15;
        if (userLocation && b.location.toLowerCase().includes(userLocation)) scoreB += 15;

        return scoreB - scoreA;
      });
    }

    // 3. Tasks / Opportunities
    let tasks = getAllTasks();
    if (cat !== 'all') {
      tasks = tasks.filter((t) => t.category.toLowerCase() === cat || t.requiredRole.toLowerCase().includes(cat));
    }
    if (query) {
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.requiredRole.toLowerCase().includes(query) ||
          t.location.toLowerCase().includes(query) ||
          t.requiredSkills.some((s) => s.toLowerCase().includes(query))
      );
    }
    // Deterministic ranking for tasks based on user role, seeking roles, and location
    if (currentUser) {
      const userRole = (currentUser.primaryRole || '').toLowerCase();
      const userSeeking = (currentUser.seekingRoles || []).map((r) => r.toLowerCase());
      const userLocation = (currentUser.location || '').toLowerCase();
      tasks.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        if (a.requiredRole.toLowerCase().includes(userRole) || userRole.includes(a.requiredRole.toLowerCase())) scoreA += 40;
        if (b.requiredRole.toLowerCase().includes(userRole) || userRole.includes(b.requiredRole.toLowerCase())) scoreB += 40;

        if (userSeeking.some((sr) => a.requiredRole.toLowerCase().includes(sr))) scoreA += 20;
        if (userSeeking.some((sr) => b.requiredRole.toLowerCase().includes(sr))) scoreB += 20;

        if (userLocation && a.location.toLowerCase().includes(userLocation)) scoreA += 15;
        if (userLocation && b.location.toLowerCase().includes(userLocation)) scoreB += 15;

        return scoreB - scoreA;
      });
    }

    // 4. Creative Clubs
    let clubs = getAllClubs();
    if (cat !== 'all') {
      clubs = clubs.filter((c) => c.category.toLowerCase() === cat || c.tags.some((t) => t.toLowerCase() === cat));
    }
    if (query) {
      clubs = clubs.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.tagline.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query) ||
          c.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    // Deterministic ranking for clubs
    clubs.sort((a, b) => {
      let scoreA = a.memberCount || 0;
      let scoreB = b.memberCount || 0;
      if (currentUser) {
        const userRole = (currentUser.primaryRole || '').toLowerCase();
        if (a.category.toLowerCase().includes(userRole) || userRole.includes(a.category.toLowerCase())) scoreA += 30;
        if (b.category.toLowerCase().includes(userRole) || userRole.includes(b.category.toLowerCase())) scoreB += 30;
      }
      return scoreB - scoreA;
    });

    // 5. Suggested Creators (with deterministic scoring & reason)
    let allUsers = getAllUsers();
    if (currentUser) {
      allUsers = allUsers.filter((u) => u.id !== currentUser.id);
    }

    if (cat !== 'all') {
      allUsers = allUsers.filter(
        (u) =>
          u.primaryRole.toLowerCase().includes(cat) ||
          (u.secondaryRoles || []).some((r) => r.toLowerCase().includes(cat))
      );
    }
    if (query) {
      allUsers = allUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.primaryRole.toLowerCase().includes(query) ||
          u.location.toLowerCase().includes(query) ||
          (u.bio && u.bio.toLowerCase().includes(query))
      );
    }

    const scoredCreators: ExploreCreatorItem[] = allUsers.map((u) => {
      const { score, reason } = this.calculateCreatorRelevance(u, currentUser);
      return { ...u, relevanceScore: score, discoveryReason: reason };
    });

    scoredCreators.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return {
      success: true,
      activeCategory: cat,
      counts: {
        works: works.length,
        projects: projects.length,
        tasks: tasks.length,
        clubs: clubs.length,
        creators: scoredCreators.length,
      },
      featuredWorks: works,
      projects,
      tasks,
      clubs,
      suggestedCreators: scoredCreators,
    };
  }

  /**
   * Retrieves single item detail
   */
  public static getItemDetail(type: ExploreItemType, id: string): any {
    switch (type) {
      case 'work':
        return getWorkShowcaseById(id);
      case 'project':
        return getProjectById(id);
      case 'task':
        return getTaskById(id);
      case 'club':
        return getClubById(id);
      case 'creator':
        return getUserById(id);
      default:
        return null;
    }
  }

  /**
   * Work -> People Discovery: Returns interconnected items
   */
  public static getRelatedContent(type: ExploreItemType, id: string): ExploreRelatedResponse {
    const allUsers = getAllUsers();
    const allProjects = getAllProjects();
    const allTasks = getAllTasks();
    const allClubs = getAllClubs();

    let relatedCreators: CreatorProfile[] = [];
    let relatedProjects: Project[] = [];
    let relatedTasks: ProjectTask[] = [];
    let relatedClubs: CreativeClub[] = [];

    if (type === 'work') {
      const work = getWorkShowcaseById(id);
      if (work) {
        if (work.creator) relatedCreators.push(work.creator);
        // Find creators matching roles involved
        const roles = (work.rolesInvolved || []).map((r) => r.toLowerCase());
        const roleMatches = allUsers.filter(
          (u) => u.id !== work.creatorId && roles.some((r) => u.primaryRole.toLowerCase().includes(r))
        );
        relatedCreators.push(...roleMatches.slice(0, 3));
        // Related clubs in work category
        relatedClubs = allClubs.filter((c) => c.category === work.category);
        // Related tasks in work category
        relatedTasks = allTasks.filter((t) => t.category === work.category);
      }
    } else if (type === 'project') {
      const project = getProjectById(id);
      if (project) {
        if (project.seeker) relatedCreators.push(project.seeker);
        // Matching creators for required roles
        const reqRoles = project.parsedRequirements.rolesNeeded.map((r) => r.roleTitle.toLowerCase());
        const matches = allUsers.filter(
          (u) => u.id !== project.seekerId && reqRoles.some((r) => u.primaryRole.toLowerCase().includes(r))
        );
        relatedCreators.push(...matches.slice(0, 4));
        // Project's tasks
        relatedTasks = allTasks.filter((t) => t.projectId === project.id);
        // Related clubs
        relatedClubs = allClubs.filter((c) =>
          project.genreTags.some((g) => g.toLowerCase().includes(c.category.toLowerCase()))
        );
      }
    } else if (type === 'task') {
      const task = getTaskById(id);
      if (task) {
        if (task.creator) relatedCreators.push(task.creator);
        // Creators matching required role
        const matches = allUsers.filter(
          (u) => u.id !== task.creatorId && u.primaryRole.toLowerCase().includes(task.requiredRole.toLowerCase())
        );
        relatedCreators.push(...matches.slice(0, 3));
        // Parent project
        const parent = allProjects.find((p) => p.id === task.projectId);
        if (parent) relatedProjects.push(parent);
        // Related clubs
        relatedClubs = allClubs.filter((c) => c.category === task.category);
      }
    } else if (type === 'club') {
      const club = getClubById(id);
      if (club) {
        if (club.leadCreator) relatedCreators.push(club.leadCreator);
        // Community members in same category
        const members = allUsers.filter(
          (u) => u.id !== club.leadCreatorId && u.primaryRole.toLowerCase().includes(club.category.toLowerCase())
        );
        relatedCreators.push(...members.slice(0, 4));
        // Projects & Tasks in this category
        relatedProjects = allProjects.filter((p) =>
          p.parsedRequirements.rolesNeeded.some((r) => r.roleTitle.toLowerCase().includes(club.category.toLowerCase()))
        );
        relatedTasks = allTasks.filter((t) => t.category === club.category);
      }
    } else if (type === 'creator') {
      const creator = getUserById(id);
      if (creator) {
        // Projects where creator is seeker or collaborator
        relatedProjects = allProjects.filter(
          (p) => p.seekerId === id || (p.collaboratorIds || []).includes(id)
        );
        // Tasks created by or open in creator domain
        relatedTasks = allTasks.filter((t) => t.creatorId === id);
        // Clubs lead by or matching role
        relatedClubs = allClubs.filter(
          (c) => c.leadCreatorId === id || c.category.toLowerCase().includes(creator.primaryRole.toLowerCase())
        );
        // Peer creators
        relatedCreators = allUsers.filter((u) => u.id !== id).slice(0, 3);
      }
    }

    return {
      success: true,
      itemType: type,
      itemId: id,
      relatedCreators,
      relatedProjects,
      relatedTasks,
      relatedClubs,
    };
  }

  /**
   * Get public works and projects for a creator profile
   */
  public static getCreatorPublicWork(creatorId: string) {
    return getCreatorPublicWorkAndProjects(creatorId);
  }

  /**
   * Submit an application / connection proposal
   */
  public static applyToProjectOrTask(params: {
    senderId?: string;
    recipientId: string;
    projectId?: string;
    taskId?: string;
    message?: string;
  }) {
    const sender = params.senderId ? getUserById(params.senderId) : null;
    const recipient = getUserById(params.recipientId);
    if (!recipient) {
      return { success: false, error: 'Recipient creator not found.' };
    }

    const defaultMsg = sender
      ? `Hi ${recipient.name}, I would love to collaborate on your project.`
      : `Hi ${recipient.name}, I am interested in collaborating on this opportunity.`;

    const newConnection = addConnection({
      senderId: params.senderId || 'usr_sarah_producer',
      recipientId: params.recipientId,
      message: params.message || defaultMsg,
      projectId: params.projectId,
      taskId: params.taskId,
    });

    if ((newConnection as any).alreadyExists) {
      return {
        success: true,
        alreadyExists: true,
        message: `You already sent a proposal to ${recipient.name} for this opportunity.`,
        connection: newConnection,
      };
    }

    return {
      success: true,
      message: `Proposal submitted to ${recipient.name}!`,
      connection: newConnection,
    };
  }
}
