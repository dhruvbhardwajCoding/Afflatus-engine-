import { listUsers } from './dataStore';
import type { DBUser } from '../types';

/**
 * Trait keywords used to infer collaboration traits from a user's bio text
 * when they don't have a formal collaborationProfile score.
 */
const TRAIT_KEYWORDS: Record<string, string[]> = {
  creativity: ['creative', 'innovat', 'imagin', 'vision', 'artistic', 'original'],
  communication: ['communicat', 'listen', 'speak', 'articulat', 'discuss', 'proactiv'],
  reliability: ['reliab', 'dependab', 'consist', 'deadline', 'punctual', 'deliver'],
  flexibility: ['flexib', 'adapt', 'versatil', 'open-mind', 'agile'],
  teamwork: ['team', 'collaborat', 'together', 'cooperat', 'collective', 'partner'],
  feedback_openness: ['feedback', 'growth mindset', 'criticism', 'learn', 'open to'],
  leadership: ['lead', 'manag', 'direct', 'guid', 'mentor', 'captain'],
  technical_proficiency: ['technic', 'expert', 'proficien', 'skill', 'master', 'speciali'],
};

/**
 * Estimate a trait score (0-10) for a user by checking their collaborationProfile
 * first, then falling back to keyword scanning in their bio.
 */
function estimateTraitScore(user: any, trait: string): number {
  // 1. Use collaborationProfile if available
  const cp = user.collaborationProfile;
  if (cp && typeof cp[trait] === 'number') {
    return cp[trait];
  }

  // 2. Fallback: scan bio for trait keywords
  const bio = (user.bio || '').toLowerCase();
  if (!bio) return 5; // neutral default

  const keywords = TRAIT_KEYWORDS[trait] || [trait];
  const matchCount = keywords.filter(kw => bio.includes(kw)).length;

  if (matchCount >= 2) return 9;
  if (matchCount === 1) return 7;
  return 5; // no evidence → neutral
}

export class RecommendationService {
  /**
   * Two-stage pipeline:
   *   Stage 1 – Hard filters: Role (required) + Location (if specified).
   *   Stage 2 – Soft scoring: rank remaining candidates by preference traits.
   *
   * Always returns up to 10 results if any role-matched users exist,
   * even when none score high on the requested traits.
   */
  static async searchFromRequirements(requirements: any, requesterId?: string | null) {
    const allUsers = (await listUsers(500)) as DBUser[];

    // ──────────────────────────────────────────────────────────
    // Stage 1: Hard filters (Role + Location)
    // ──────────────────────────────────────────────────────────
    let pool = allUsers.filter(u => u.id && u.id !== requesterId);

    // Normalize a role string for fuzzy comparison: lowercase, strip parentheses, slashes, extra spaces
    const normalizeRole = (r: string) => r.toLowerCase().replace(/[()\/\-&]/g, ' ').replace(/\s+/g, ' ').trim();
    // Split a compound role like "Screenwriter / Scriptwriter" into individual keywords
    const roleKeywords = (r: string) => normalizeRole(r).split(' ').filter(w => w.length > 2);

    const wantedRole = (requirements.role || '').toLowerCase().trim();
    const hasRoleFilter = wantedRole && wantedRole !== 'not_specified';
    const wantedNorm = normalizeRole(wantedRole);
    const wantedWords = roleKeywords(wantedRole);

    if (hasRoleFilter) {
      pool = pool.filter(user => {
        const userRoleStrings = [
          user.primaryRole || '',
          ...(user.secondaryRoles || []),
          ...((user as any).professions || []),
        ].filter(Boolean);

        return userRoleStrings.some(r => {
          const norm = normalizeRole(r);
          const words = roleKeywords(r);
          // Check: normalized contains, or any keyword overlap
          return norm.includes(wantedNorm) 
            || wantedNorm.includes(norm)
            || wantedWords.some(w => norm.includes(w))
            || words.some(w => wantedNorm.includes(w));
        });
      });
    }

    const wantedCity = (requirements.location?.city || '').toLowerCase();
    const hasLocationFilter = wantedCity && wantedCity !== 'not_specified';

    if (hasLocationFilter) {
      pool = pool.filter(user => {
        const loc = ((user as any).location || (user as any).city || '').toLowerCase();
        return loc.includes(wantedCity);
      });
    }

    // ──────────────────────────────────────────────────────────
    // Stage 2: Soft scoring on preferences (only additive, never penalise)
    // ──────────────────────────────────────────────────────────
    const prefs = requirements.preferences || {};
    // Collect which traits the user actually cares about
    const activePrefKeys = Object.entries<any>(prefs)
      .filter(([, v]) => v.level && v.level !== 'not_specified')
      .map(([k, v]) => ({ key: k, level: v.level, importance: v.importance }));

    const scored = pool.map(user => {
      let score = 0;
      const reasons: string[] = [];

      // Give a base point for matching the role
      if (hasRoleFilter) {
        reasons.push(user.primaryRole || wantedRole);
      }

      // Score each requested preference trait
      for (const { key, level, importance } of activePrefKeys) {
        const userVal = estimateTraitScore(user, key);

        // Weight multiplier based on importance
        const weight = importance === 'required' ? 1.0
          : importance === 'preferred' ? 0.7
          : 0.4;

        // How well does the user match the requested level?
        let traitScore = 0;
        if (level === 'high') {
          traitScore = userVal / 10; // 0-1 scale, higher is better
        } else if (level === 'mid') {
          // Best match around 5-7, penalise extremes slightly
          traitScore = userVal >= 4 && userVal <= 8 ? 0.8 : 0.4;
        } else if (level === 'low') {
          traitScore = (10 - userVal) / 10; // inverted
        }

        const contribution = traitScore * weight;
        score += contribution;

        if (traitScore >= 0.7) {
          const label = key.replace(/_/g, ' ');
          reasons.push(`Strong ${label}`);
        }
      }

      // If no preferences were specified, give everyone a baseline score of 1
      if (activePrefKeys.length === 0) {
        score = 1;
      }

      return { creatorId: user.id, score, reasons, user };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    // Return top min(total, 10) – ALWAYS return results if any exist after hard filters
    const topN = Math.min(scored.length, 10);
    const results = scored.slice(0, topN);

    // Normalise scores to 0-1 for the UI
    const maxScore = results.length > 0 ? Math.max(results[0].score, 1) : 1;

    return {
      results: results.map(c => ({
        creatorId: c.creatorId,
        score: Math.min(1.0, c.score / maxScore),
        reasons: c.reasons.length > 0 ? c.reasons : ['Matches role criteria'],
        profile: {
          id: c.user.id,
          name: c.user.name,
          avatarUrl: c.user.avatarUrl,
          primaryRole: c.user.primaryRole,
          location: (c.user as any).location || (c.user as any).city,
          bio: c.user.bio,
        },
      })),
    };
  }
}
