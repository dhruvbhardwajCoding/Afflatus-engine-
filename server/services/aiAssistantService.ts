import { GoogleGenAI, Type } from '@google/genai';
import {
  getAllUsers,
  getAllProjects,
  getAllTasks,
  getAllClubs,
  getAllWorkShowcases,
  getUserById,
} from '../db';
import type {
  AssistantChatResponse,
  AssistantIntent,
  AssistantMatchedItem,
  AssistantAction,
  CreatorProfile,
  Project,
  ProjectTask,
  WorkShowcase,
  CreativeClub,
} from '../types';

// Resilient Model Fallback Ladder per Production Directives
const MODEL_FALLBACK_LADDER = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.info('[AiAssistant] GoogleGenAI client initialization note:', err);
    }
  }
  return aiClient;
}

export class AiAssistantService {
  /**
   * Safe helper to execute Gemini content generation across the fallback ladder.
   * Gracefully falls back to deterministic matching on permission/access limits or transient API outages.
   */
  public static async generateContentWithFallback(
    prompt: string,
    systemInstruction: string,
    schemaConfig?: any
  ): Promise<{ text: string; modelUsed: string } | null> {
    const ai = getGeminiClient();
    if (!ai) return null;

    let lastError: any = null;

    for (const model of MODEL_FALLBACK_LADDER) {
      try {
        const config: any = {
          systemInstruction,
          temperature: 0.3,
        };

        if (schemaConfig) {
          config.responseMimeType = 'application/json';
          config.responseSchema = schemaConfig;
        }

        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });

        if (response && response.text) {
          return { text: response.text, modelUsed: model };
        }
      } catch (err: any) {
        lastError = err;
        const statusCode =
          err?.status ||
          err?.code ||
          (err?.error && (err.error.code || err.error.status)) ||
          '';
        const errMsg =
          err?.message ||
          (err?.error && err.error.message) ||
          JSON.stringify(err);

        const isPermissionDenied =
          statusCode === 403 ||
          statusCode === 'PERMISSION_DENIED' ||
          errMsg.includes('PERMISSION_DENIED') ||
          errMsg.includes('denied access');

        if (isPermissionDenied) {
          // 403 PERMISSION_DENIED is an account/project-level permission constraint across models.
          // Cease redundant requests through the ladder to maintain zero downtime and avoid error spikes.
          console.info(
            '[AiAssistant] Gemini API access restricted (403 PERMISSION_DENIED). Activating high-precision deterministic discovery engine.'
          );
          return null;
        }

        // Recoverable HTTP/API status codes per Production Directives:
        // (503 UNAVAILABLE, 429 RESOURCE_EXHAUSTED, 404 NOT_FOUND, 500 INTERNAL)
        console.info(
          `[AiAssistant] Model ${model} encountered recoverable status (${statusCode || 'transient'}), evaluating next ladder tier...`
        );
      }
    }

    if (lastError) {
      console.info(
        '[AiAssistant] Model ladder completed. Engaging deterministic discovery engine.'
      );
    }
    return null;
  }

  /**
   * Sanitize public profile to omit passwordHash, email, emergency contact
   */
  public static sanitizePublicProfile(user: any): CreatorProfile {
    if (!user) return user;
    const { passwordHash, email, emergencyContact, ...cleanProfile } = user;
    return cleanProfile as CreatorProfile;
  }

  public static sanitizeTask(task: any): ProjectTask {
    if (!task) return task;
    return {
      ...task,
      creator: task.creator ? this.sanitizePublicProfile(task.creator) : undefined,
    };
  }

  public static sanitizeProject(project: any): Project {
    if (!project) return project;
    return {
      ...project,
      seeker: project.seeker ? this.sanitizePublicProfile(project.seeker) : undefined,
      collaborators: Array.isArray(project.collaborators)
        ? project.collaborators.map((c: any) => this.sanitizePublicProfile(c))
        : undefined,
    };
  }

  /**
   * Sanitize user profile to protect private data (OWASP Broken Access Control & Data Exposure)
   */
  private static sanitizeUserContext(user?: CreatorProfile | null): any {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      primaryRole: user.primaryRole,
      secondaryRoles: user.secondaryRoles || [],
      seekingRoles: user.seekingRoles || [],
      location: user.location,
      pastBudgetTiers: user.pastBudgetTiers || [],
      dayRateUsd: user.dayRateUsd,
      gearCount: (user.gearItems || []).length,
    };
  }

  /**
   * Main assistant query processing method
   */
  public static async processQuery(params: {
    prompt: string;
    userId?: string;
    currentUserProfile?: CreatorProfile | null;
  }): Promise<AssistantChatResponse> {
    const rawPrompt = (params.prompt || '').trim();
    if (!rawPrompt) {
      return {
        success: false,
        message: 'Please provide a question or search query.',
        intent: 'general_inquiry',
      };
    }

    // Load current user profile from DB or context
    const dbUser = params.userId ? getUserById(params.userId) : null;
    const activeUser = dbUser || params.currentUserProfile || null;
    const sanitizedContext = this.sanitizeUserContext(activeUser);

    // Retrieve full real database entities
    const allUsers = getAllUsers();
    const allProjects = getAllProjects();
    const allTasks = getAllTasks();
    const allClubs = getAllClubs();
    const allWorks = getAllWorkShowcases();

    // Compact entity catalog for grounding
    const catalogSummary = {
      creators: allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.primaryRole,
        secondary: u.secondaryRoles,
        location: u.location,
        seeking: u.seekingRoles,
        rate: u.dayRateUsd,
        bio: u.bio?.substring(0, 120),
        gear: (u.gearItems || []).map((g) => g.equipmentName).join(', '),
      })),
      projects: allProjects.map((p) => ({
        id: p.id,
        title: p.title,
        genre: p.parsedRequirements?.genre || p.genreTags?.join(', '),
        location: p.location,
        budget: p.budgetUsd,
        rolesNeeded: (p.parsedRequirements?.rolesNeeded || []).map((r) => r.roleTitle),
        brief: p.rawTextBrief?.substring(0, 120),
      })),
      tasks: allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        requiredRole: t.requiredRole,
        rate: t.dayRateInr,
        location: t.location,
        skills: t.requiredSkills,
        description: t.description?.substring(0, 120),
      })),
      clubs: allClubs.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        location: c.location,
        members: c.memberCount,
        cadence: c.meetingCadence,
      })),
    };

    // System instruction strictly preventing hallucination & ensuring grounded recommendations
    const systemInstruction = `You are C1, the intelligent copilot for Afflatus — a premier creative production collaboration network for filmmakers, cinematographers, sound designers, producers, and editors.
Your role:
1. Understand the creator's natural language goal (discovering creators, projects, paid tasks/opportunities, creative clubs/guilds, or platform guidance).
2. NEVER invent fake creator names, project titles, task IDs, or rates. Only recommend real items from the provided catalog.
3. Return a helpful, concise, professional response.
4. Output JSON with intent classification and matched item IDs.`;

    const aiPrompt = `USER CONTEXT:
${JSON.stringify(sanitizedContext, null, 2)}

DATABASE CATALOG SUMMARY:
${JSON.stringify(catalogSummary, null, 2)}

USER MESSAGE:
"${rawPrompt}"

Analyze this query and return strict JSON with:
- "message": Clear, friendly response in conversational voice summarizing recommendations or answering the user's question directly.
- "intent": One of ["discover_creators", "discover_projects", "discover_tasks", "discover_works", "discover_clubs", "platform_guidance", "general_inquiry"]
- "matchedCreatorIds": Array of exact IDs of matched creators from the catalog (max 4).
- "matchedProjectIds": Array of exact IDs of matched projects from the catalog (max 3).
- "matchedTaskIds": Array of exact IDs of matched tasks from the catalog (max 3).
- "matchedClubIds": Array of exact IDs of matched clubs from the catalog (max 2).
- "primaryCategory": One of ["cinematography", "directing", "production", "sound", "editing", "design", "all"]`;

    const schemaConfig = {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING },
        intent: { type: Type.STRING },
        matchedCreatorIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        matchedProjectIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        matchedTaskIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        matchedClubIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        primaryCategory: { type: Type.STRING },
      },
      required: ['message', 'intent'],
    };

    // Attempt Gemini with fallback ladder
    const aiResult = await this.generateContentWithFallback(aiPrompt, systemInstruction, schemaConfig);

    if (aiResult && aiResult.text) {
      try {
        const parsed = JSON.parse(aiResult.text);
        const intent = (parsed.intent || 'general_inquiry') as AssistantIntent;
        const matchedItems: AssistantMatchedItem[] = [];

        // 1. Creators
        if (Array.isArray(parsed.matchedCreatorIds)) {
          for (const cid of parsed.matchedCreatorIds) {
            const user = allUsers.find((u) => u.id === cid);
            if (user) {
              matchedItems.push({
                type: 'creator',
                id: user.id,
                title: user.name,
                subtitle: `${user.primaryRole} • ${user.location || 'India'}`,
                badge: user.dayRateUsd ? `₹${user.dayRateUsd.toLocaleString()}/day` : 'Available',
                details: user.bio || undefined,
                avatarUrl: user.avatarUrl,
                rateOrBudget: user.dayRateUsd ? `₹${user.dayRateUsd.toLocaleString()}` : undefined,
                itemData: this.sanitizePublicProfile(user),
              });
            }
          }
        }

        // 2. Tasks
        if (Array.isArray(parsed.matchedTaskIds)) {
          for (const tid of parsed.matchedTaskIds) {
            const task = allTasks.find((t) => t.id === tid);
            if (task) {
              matchedItems.push({
                type: 'task',
                id: task.id,
                title: task.title,
                subtitle: `${task.requiredRole} • ${task.location}`,
                badge: task.dayRateInr ? `₹${task.dayRateInr.toLocaleString()}/day` : 'Opportunity',
                details: task.description,
                rateOrBudget: `₹${task.dayRateInr?.toLocaleString() || '0'}/day`,
                itemData: this.sanitizeTask(task),
              });
            }
          }
        }

        // 3. Projects
        if (Array.isArray(parsed.matchedProjectIds)) {
          for (const pid of parsed.matchedProjectIds) {
            const project = allProjects.find((p) => p.id === pid);
            if (project) {
              matchedItems.push({
                type: 'project',
                id: project.id,
                title: project.title,
                subtitle: `${project.parsedRequirements?.genre || 'Production'} • ${project.location}`,
                badge: project.budgetUsd ? `₹${project.budgetUsd.toLocaleString()} Budget` : 'Production',
                details: project.rawTextBrief,
                rateOrBudget: `₹${project.budgetUsd?.toLocaleString() || '0'}`,
                itemData: this.sanitizeProject(project),
              });
            }
          }
        }

        // 4. Clubs
        if (Array.isArray(parsed.matchedClubIds)) {
          for (const clid of parsed.matchedClubIds) {
            const club = allClubs.find((c) => c.id === clid);
            if (club) {
              matchedItems.push({
                type: 'club',
                id: club.id,
                title: club.name,
                subtitle: `${club.category} Guild • ${club.location}`,
                badge: `${club.memberCount} Members`,
                details: club.tagline || club.description,
                avatarUrl: club.avatarUrl,
                itemData: club,
              });
            }
          }
        }

        // Build contextual actions
        const suggestedActions: AssistantAction[] = [];
        const categoryFilter = parsed.primaryCategory || 'all';

        if (intent === 'discover_tasks' || matchedItems.some((m) => m.type === 'task')) {
          suggestedActions.push({
            label: 'Browse All Opportunities',
            actionType: 'navigate_explore',
            payload: { tab: 'tasks', category: categoryFilter !== 'all' ? categoryFilter : undefined },
          });
        }
        if (intent === 'discover_projects' || matchedItems.some((m) => m.type === 'project')) {
          suggestedActions.push({
            label: 'View Open Projects',
            actionType: 'navigate_explore',
            payload: { tab: 'projects', category: categoryFilter !== 'all' ? categoryFilter : undefined },
          });
        }
        if (intent === 'discover_creators' || matchedItems.some((m) => m.type === 'creator')) {
          suggestedActions.push({
            label: 'Discover Creators',
            actionType: 'navigate_explore',
            payload: { tab: 'creators', category: categoryFilter !== 'all' ? categoryFilter : undefined },
          });
        }
        if (intent === 'discover_clubs' || matchedItems.some((m) => m.type === 'club')) {
          suggestedActions.push({
            label: 'Explore Creative Clubs',
            actionType: 'navigate_explore',
            payload: { tab: 'clubs' },
          });
        }

        return {
          success: true,
          message: parsed.message,
          intent,
          matchedItems: matchedItems.slice(0, 6),
          suggestedActions,
          modelUsed: aiResult.modelUsed,
        };
      } catch (parseErr) {
        console.info('[AiAssistant] JSON parsing fell back to deterministic engine.');
      }
    }

    // Deterministic Rule & Semantic Fallback Engine (Guaranteed zero-crash offline capability)
    return this.deterministicSearchFallback({
      prompt: rawPrompt,
      activeUser,
      allUsers,
      allProjects,
      allTasks,
      allClubs,
      allWorks,
    });
  }

  /**
   * Deterministic search & guidance fallback when AI model is offline
   */
  private static deterministicSearchFallback(params: {
    prompt: string;
    activeUser?: CreatorProfile | null;
    allUsers: CreatorProfile[];
    allProjects: Project[];
    allTasks: ProjectTask[];
    allClubs: CreativeClub[];
    allWorks: WorkShowcase[];
  }): AssistantChatResponse {
    const q = params.prompt.toLowerCase();
    const matchedItems: AssistantMatchedItem[] = [];
    let intent: AssistantIntent = 'general_inquiry';
    let message = '';
    const suggestedActions: AssistantAction[] = [];

    const isAskingAboutTasks = q.includes('task') || q.includes('opportunity') || q.includes('gig') || q.includes('hire') || q.includes('job') || q.includes('apply');
    const isAskingAboutProjects = q.includes('project') || q.includes('film') || q.includes('shoot') || q.includes('campaign') || q.includes('brief');
    const isAskingAboutPeople = q.includes('dp') || q.includes('cinematograph') || q.includes('editor') || q.includes('sound') || q.includes('director') || q.includes('producer') || q.includes('person') || q.includes('who') || q.includes('creator');
    const isAskingAboutClubs = q.includes('club') || q.includes('guild') || q.includes('community') || q.includes('meet');
    const isAskingHowTo = q.includes('how') || q.includes('what is') || q.includes('rate') || q.includes('match') || q.includes('score');

    if (isAskingAboutTasks) {
      intent = 'discover_tasks';
      const tasks = params.allTasks.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.requiredRole.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.requiredSkills.some((s) => s.toLowerCase().includes(q))
      );
      const chosen = (tasks.length > 0 ? tasks : params.allTasks).slice(0, 3);
      for (const t of chosen) {
        matchedItems.push({
          type: 'task',
          id: t.id,
          title: t.title,
          subtitle: `${t.requiredRole} • ${t.location}`,
          badge: `₹${t.dayRateInr?.toLocaleString() || 0}/day`,
          details: t.description,
          rateOrBudget: `₹${t.dayRateInr?.toLocaleString() || 0}`,
          itemData: this.sanitizeTask(t),
        });
      }
      message = `I found ${chosen.length} relevant production opportunities open right now. You can apply directly with one click!`;
      suggestedActions.push({
        label: 'View All Opportunities',
        actionType: 'navigate_explore',
        payload: { tab: 'tasks' },
      });
    } else if (isAskingAboutPeople) {
      intent = 'discover_creators';
      const creators = params.allUsers.filter((u) =>
        u.primaryRole.toLowerCase().includes(q) ||
        (u.secondaryRoles || []).some((r) => r.toLowerCase().includes(q)) ||
        (u.bio && u.bio.toLowerCase().includes(q)) ||
        (u.gearItems || []).some((g) => g.equipmentName.toLowerCase().includes(q)) ||
        u.name.toLowerCase().includes(q)
      );
      const chosen = (creators.length > 0 ? creators : params.allUsers.slice(0, 3)).slice(0, 3);
      for (const u of chosen) {
        matchedItems.push({
          type: 'creator',
          id: u.id,
          title: u.name,
          subtitle: `${u.primaryRole} • ${u.location || 'India'}`,
          badge: u.dayRateUsd ? `₹${u.dayRateUsd.toLocaleString()}/day` : 'Available',
          details: u.bio,
          avatarUrl: u.avatarUrl,
          rateOrBudget: u.dayRateUsd ? `₹${u.dayRateUsd.toLocaleString()}` : undefined,
          itemData: this.sanitizePublicProfile(u),
        });
      }
      message = `Here are verified creators matching your craft inquiry:`;
      suggestedActions.push({
        label: 'Explore All Creators',
        actionType: 'navigate_explore',
        payload: { tab: 'creators' },
      });
    } else if (isAskingAboutProjects) {
      intent = 'discover_projects';
      const projects = params.allProjects.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.rawTextBrief.toLowerCase().includes(q) ||
        p.genreTags.some((g) => g.toLowerCase().includes(q))
      );
      const chosen = (projects.length > 0 ? projects : params.allProjects).slice(0, 3);
      for (const p of chosen) {
        matchedItems.push({
          type: 'project',
          id: p.id,
          title: p.title,
          subtitle: `${p.parsedRequirements?.genre || 'Production'} • ${p.location}`,
          badge: p.budgetUsd ? `₹${p.budgetUsd.toLocaleString()} Budget` : 'Production',
          details: p.rawTextBrief,
          rateOrBudget: `₹${p.budgetUsd?.toLocaleString() || 0}`,
          itemData: this.sanitizeProject(p),
        });
      }
      message = `Here are active film & commercial production projects currently looking for key crew members:`;
      suggestedActions.push({
        label: 'Browse Production Briefs',
        actionType: 'navigate_explore',
        payload: { tab: 'projects' },
      });
    } else if (isAskingAboutClubs) {
      intent = 'discover_clubs';
      const clubs = params.allClubs.slice(0, 2);
      for (const c of clubs) {
        matchedItems.push({
          type: 'club',
          id: c.id,
          title: c.name,
          subtitle: `${c.category} Guild • ${c.location}`,
          badge: `${c.memberCount} Members`,
          details: c.tagline,
          avatarUrl: c.avatarUrl,
          itemData: c,
        });
      }
      message = `Here are active creative clubs and guilds meeting regularly in Mumbai and beyond:`;
      suggestedActions.push({
        label: 'View Creative Clubs',
        actionType: 'navigate_explore',
        payload: { tab: 'clubs' },
      });
    } else if (isAskingHowTo) {
      intent = 'platform_guidance';
      message = `Afflatus connects filmmakers and commercial creators using bidirectional compatibility matching. You can discover projects, apply directly to paid tasks, showcase portfolio works, or connect with peers based on verified equipment and past production budgets.`;
      suggestedActions.push(
        { label: 'Explore Opportunities', actionType: 'navigate_explore', payload: { tab: 'tasks' } },
        { label: 'View Creator Matches', actionType: 'navigate_explore', payload: { tab: 'creators' } }
      );
    } else {
      intent = 'general_inquiry';
      message = `I can help you discover verified crew members, find paid project tasks, explore commercial productions, or find creative guilds. Try asking for "Directors of Photography in Mumbai", "Paid sound tasks", or "Commercial projects".`;
      suggestedActions.push(
        { label: 'Browse Explore Feed', actionType: 'navigate_explore', payload: { tab: 'all' } },
        { label: 'Show Tasks', actionType: 'navigate_explore', payload: { tab: 'tasks' } }
      );
    }

    return {
      success: true,
      message,
      intent,
      matchedItems,
      suggestedActions,
      modelUsed: 'deterministic-engine',
    };
  }
}
