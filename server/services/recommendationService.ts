/**
 * Recommendation pipeline (spec §19–21, §24, §28).
 * Stage 1 Hard filter → Stage 2 semantic (stub) → Stage 3 weighted rank via AI Backend.
 */
import { normalizeProfession } from '../constants/professions';
import { toPublicProfile } from './profileService';
import { AiBackendClient } from './aiBackendClient';
import { CollaborationService } from './collaborationService';
import { listUsers, isFirestoreEnabled } from './dataStore';
import { SemanticService } from './semanticService';
import type { DBUser } from '../types';

export interface RecommendationSearchRequest {
  location?: string | null;
  projectType?: string | null;
  genres?: string[];
  requiredRoles?: string[];
  availability?: { start?: string; end?: string } | null;
  limit?: number;
  excludeUserIds?: string[];
  /** Optional: boost candidates who worked well with this user */
  requesterId?: string | null;
}

export interface RankedCandidate {
  userId: string;
  score: number;
  matchReasons: string[];
  profile: ReturnType<typeof toPublicProfile>;
}

function cityMatch(userLoc: string | undefined, target: string | undefined | null): boolean {
  if (!target) return true;
  if (!userLoc) return false;
  const a = userLoc.toLowerCase();
  const b = target.toLowerCase();
  return a.includes(b) || b.includes(a.split(',')[0].trim());
}

function roleMatch(user: DBUser, required: string[]): boolean {
  if (!required.length) return true;
  const profile = toPublicProfile(user);
  const userRoles = new Set(
    [
      ...(profile.professions || []),
      profile.primaryRole,
      ...(profile.secondaryRoles || []),
    ]
      .filter(Boolean)
      .map((r) => normalizeProfession(String(r)))
  );
  return required.some((r) => userRoles.has(normalizeProfession(r)));
}

function availabilityOk(user: DBUser, reqAvail?: { start?: string; end?: string } | null): boolean {
  const avail = (user as any).availability;
  if (!avail) return true; // unknown → allow
  if (avail.status === 'busy') return false;
  // date-window checks can be refined later
  if (reqAvail?.start && avail.availableFrom) {
    // simple string compare ISO dates
    if (avail.availableFrom > reqAvail.start && reqAvail.end && avail.availableFrom > reqAvail.end) {
      return false;
    }
  }
  return true;
}

function localScore(user: DBUser, req: RecommendationSearchRequest): {
  scores: Record<string, number>;
  reasons: string[];
} {
  const profile = toPublicProfile(user);
  const reasons: string[] = [];
  const scores: Record<string, number> = {
    semanticMatch: 0.5,
    skillMatch: 0.5,
    relevantExperience: 0.5,
    interestMatch: 0.5,
    availability: 0.7,
    location: 0.5,
    reliability: profile.reputationScore ?? 0.7,
    collaboration: 0.5,
  };

  // Collaboration graph boost
  if (req.requesterId) {
    const cScore = CollaborationService.getScore(req.requesterId, user.id);
    scores.collaboration = cScore;
    if (cScore > 0.6) {
      reasons.push('Previously collaborated successfully in your network');
    }
  }

  // Location
  const loc = profile.location || profile.city || '';
  if (req.location && cityMatch(loc, req.location)) {
    scores.location = 1;
    reasons.push(`Located in ${loc || req.location}`);
  } else if (!req.location) {
    scores.location = 0.7;
  } else {
    scores.location = 0.15;
  }

  // Role / skill
  if (req.requiredRoles?.length) {
    const matched = req.requiredRoles.filter((r) =>
      roleMatch(user, [r])
    );
    scores.skillMatch = matched.length / req.requiredRoles.length;
    if (matched.length) {
      reasons.push(`Role match: ${matched.map((r) => normalizeProfession(r)).join(', ')}`);
    }
  }

  // Genres → interests + experience
  if (req.genres?.length) {
    let interestSum = 0;
    let expSum = 0;
    for (const g of req.genres) {
      const key = g.toLowerCase();
      interestSum += Number(profile.interests?.[key] ?? 0.3);
      expSum += Number(profile.experience?.[key] ?? profile.experience?.overall ?? 0.4);
    }
    scores.interestMatch = Math.min(1, interestSum / req.genres.length);
    scores.relevantExperience = Math.min(1, expSum / req.genres.length);
    if (scores.relevantExperience > 0.5) {
      reasons.push(`Relevant experience in ${req.genres.join('/')}`);
    }
    if (scores.interestMatch > 0.6) {
      reasons.push(`Strong interest in ${req.genres.join('/')}`);
    }
  }

  // Availability
  const avail = profile.availability;
  if (avail?.status === 'available') {
    scores.availability = 1;
    reasons.push('Currently available');
  } else if (avail?.status === 'busy') {
    scores.availability = 0.1;
  }

  if (!reasons.length) reasons.push('Matches project requirements');

  // crude semantic proxy from bio + roles
  const blob = `${profile.bio || ''} ${(profile.professions || []).join(' ')}`.toLowerCase();
  if (req.genres?.some((g) => blob.includes(g.toLowerCase()))) {
    scores.semanticMatch = 0.85;
  }

  return { scores, reasons };
}

export class RecommendationService {
  static async search(req: RecommendationSearchRequest): Promise<{
    candidates: RankedCandidate[];
    totalFiltered: number;
    pipeline: string[];
  }> {
    const allUsers = (await listUsers(500)) as DBUser[];
    const exclude = new Set(req.excludeUserIds || []);
    const roles = (req.requiredRoles || []).map((r) => normalizeProfession(r));

    // Stage 1 — Hard filters
    let pool = allUsers.filter((u) => {
      if (!u?.id || exclude.has(u.id)) return false;
      if (req.location && !cityMatch((u as any).location || (u as any).city, req.location)) {
        return false;
      }
      if (roles.length && !roleMatch(u, roles)) return false;
      if (!availabilityOk(u, req.availability)) return false;
      return true;
    });

    const totalFiltered = pool.length;
    const pipeline = [
      isFirestoreEnabled() ? 'data:firestore' : 'data:memory',
      'hard_filter:location+profession+availability',
      `pool_size:${totalFiltered}`,
    ];

    // Stage 2 — semantic + local scoring
    const projectEmb = await SemanticService.projectEmbedding({
      location: req.location,
      projectType: req.projectType,
      genres: req.genres,
      requiredRoles: roles,
    });
    if (projectEmb) pipeline.push('semantic:embeddings');
    else pipeline.push('semantic:text_fallback');

    const withScores = pool.map((u) => {
      const { scores, reasons } = localScore(u, { ...req, requiredRoles: roles });
      const sem = SemanticService.semanticScore(projectEmb, {
        ...u,
        _projectLocation: req.location,
        _projectType: req.projectType,
        _genres: req.genres,
        _roles: roles,
      });
      scores.semanticMatch = Math.max(scores.semanticMatch || 0, sem);
      return {
        userId: u.id,
        scores,
        matchReasons: reasons,
        profile: toPublicProfile(u),
        // pass through for AI ranker
        location: (u as any).location || (u as any).city,
        primaryRole: u.primaryRole,
        professions: (toPublicProfile(u) as any).professions,
        availability: (toPublicProfile(u) as any).availability,
      };
    });

    // Stage 3 — AI Backend ranking (or local weighted sum fallback)
    const rankResult = await AiBackendClient.rankCandidates(withScores);
    let ranked: RankedCandidate[];

    if (rankResult.ok && Array.isArray(rankResult.ranked) && rankResult.ranked.length) {
      pipeline.push('ai_backend:rank');
      ranked = rankResult.ranked.map((c: any) => ({
        userId: c.userId,
        score: Number(c.score) || 0,
        matchReasons: c.matchReasons || withScores.find((w) => w.userId === c.userId)?.matchReasons || [],
        profile: c.profile || withScores.find((w) => w.userId === c.userId)?.profile,
      }));
    } else {
      pipeline.push('local_weighted_rank');
      const weights = {
        semanticMatch: 0.3,
        skillMatch: 0.2,
        relevantExperience: 0.15,
        interestMatch: 0.1,
        availability: 0.1,
        location: 0.05,
        reliability: 0.05,
        collaboration: 0.05,
      };
      ranked = withScores
        .map((c) => {
          let total = 0;
          for (const [k, w] of Object.entries(weights)) {
            total += (Number((c.scores as any)[k]) || 0) * w;
          }
          return {
            userId: c.userId,
            score: Math.min(1, Math.max(0, total)),
            matchReasons: c.matchReasons,
            profile: c.profile,
          };
        })
        .sort((a, b) => b.score - a.score);
    }

    const limit = Math.min(req.limit || 20, 50);
    return {
      candidates: ranked.slice(0, limit),
      totalFiltered,
      pipeline,
    };
  }
}
