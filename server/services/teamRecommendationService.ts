/**
 * Team recommendation (spec §23) — basic version.
 * Picks a set of people covering required roles, maximizing
 * individual scores + pairwise collaboration compatibility.
 */
import { RecommendationService, type RecommendationSearchRequest } from './recommendationService';
import { CollaborationService } from './collaborationService';

export interface TeamMemberPick {
  role: string;
  userId: string;
  score: number;
  matchReasons: string[];
  profile: any;
}

export interface TeamResult {
  members: TeamMemberPick[];
  teamScore: number;
  coverage: string[];
  notes: string[];
}

export class TeamRecommendationService {
  static async recommendTeam(req: RecommendationSearchRequest & { roles?: string[] }): Promise<TeamResult> {
    const roles = (req.roles || req.requiredRoles || []).map((r) => r.toLowerCase());
    if (!roles.length) {
      return { members: [], teamScore: 0, coverage: [], notes: ['No roles requested'] };
    }

    // Get a wider candidate pool once
    const pool = await RecommendationService.search({
      ...req,
      requiredRoles: roles,
      limit: 40,
    });

    const used = new Set<string>();
    const members: TeamMemberPick[] = [];
    const notes: string[] = [];

    for (const role of roles) {
      // candidates that match this role
      const roleCandidates = pool.candidates.filter((c) => {
        if (used.has(c.userId)) return false;
        const profs = [
          c.profile.primaryRole,
          ...((c.profile as any).professions || []),
          ...((c.profile as any).secondaryRoles || []),
        ]
          .filter(Boolean)
          .map((x: string) => x.toLowerCase());
        return profs.some(
          (p) => p.includes(role) || role.includes(p.split(' ')[0]) || p.includes(role.split('_')[0])
        );
      });

      // rank by individual score + avg collab with already picked members
      const scored = roleCandidates.map((c) => {
        let collabBoost = 0;
        if (members.length) {
          const scores = members.map((m) => CollaborationService.getScore(m.userId, c.userId));
          collabBoost = scores.reduce((a, b) => a + b, 0) / scores.length;
        }
        const combined = 0.75 * c.score + 0.25 * collabBoost;
        return { c, combined, collabBoost };
      });
      scored.sort((a, b) => b.combined - a.combined);

      if (scored.length === 0) {
        notes.push(`No candidate found for role: ${role}`);
        continue;
      }

      const best = scored[0];
      used.add(best.c.userId);
      members.push({
        role,
        userId: best.c.userId,
        score: Math.round(best.combined * 100) / 100,
        matchReasons: [
          ...best.c.matchReasons,
          ...(best.collabBoost > 0.6 ? ['Good collaboration fit with selected team'] : []),
        ],
        profile: {
          id: best.c.profile.id,
          name: best.c.profile.name,
          primaryRole: best.c.profile.primaryRole,
          avatarUrl: best.c.profile.avatarUrl,
          location: (best.c.profile as any).location || (best.c.profile as any).city,
        },
      });
    }

    // Team score = avg individual + pair compatibility
    let pairSum = 0;
    let pairCount = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        pairSum += CollaborationService.getScore(members[i].userId, members[j].userId);
        pairCount++;
      }
    }
    const avgIndividual =
      members.length > 0 ? members.reduce((s, m) => s + m.score, 0) / members.length : 0;
    const avgPair = pairCount ? pairSum / pairCount : 0.5;
    const teamScore = Math.round((0.7 * avgIndividual + 0.3 * avgPair) * 100) / 100;

    return {
      members,
      teamScore,
      coverage: members.map((m) => m.role),
      notes,
    };
  }
}
