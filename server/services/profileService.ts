/**
 * Profile model (spec §3–8, §17, §25).
 * Extends existing CreatorProfile without breaking current data.
 */
import { getDatabase, saveDatabase, getUserById } from '../db';
import { saveUser, getUser, isFirestoreEnabled } from './dataStore';
import type { DBUser } from '../types';
import { normalizeProfession, type ProfessionId } from '../constants/professions';

export interface AvailabilityModel {
  status: 'available' | 'busy' | 'available_from' | 'available_until';
  availableFrom?: string | null;
  availableUntil?: string | null;
}

export interface ProfileDimensions {
  professions: ProfessionId[];
  skills: Record<string, number>;
  interests: Record<string, number>;
  experience: Record<string, number>;
  availability: AvailabilityModel;
  portfolio: Array<{
    id: string;
    title?: string;
    url?: string;
    mediaType?: string;
    tags?: string[];
  }>;
  profileEmbedding?: number[] | null;
  reputationScore?: number;
}

function ensureDimensions(user: DBUser): ProfileDimensions {
  const anyUser = user as any;

  // Prefer new fields; fall back to legacy primaryRole / secondaryRoles
  let professions: ProfessionId[] = Array.isArray(anyUser.professions)
    ? anyUser.professions.map((p: string) => normalizeProfession(p))
    : [];

  if (!professions.length) {
    if (user.primaryRole) professions.push(normalizeProfession(user.primaryRole));
    if (Array.isArray(user.secondaryRoles)) {
      for (const r of user.secondaryRoles) {
        const id = normalizeProfession(r);
        if (!professions.includes(id)) professions.push(id);
      }
    }
  }
  if (!professions.length) professions = ['other'];

  const skills: Record<string, number> =
    anyUser.skills && typeof anyUser.skills === 'object' ? { ...anyUser.skills } : {};

  const interests: Record<string, number> =
    anyUser.interests && typeof anyUser.interests === 'object' ? { ...anyUser.interests } : {};

  const experience: Record<string, number> =
    anyUser.experience && typeof anyUser.experience === 'object'
      ? { ...anyUser.experience }
      : { overall: 0.5 };

  const availability: AvailabilityModel = anyUser.availability && typeof anyUser.availability === 'object'
    ? {
        status: anyUser.availability.status || 'available',
        availableFrom: anyUser.availability.availableFrom ?? null,
        availableUntil: anyUser.availability.availableUntil ?? null,
      }
    : { status: 'available' };

  const portfolio = Array.isArray(anyUser.portfolios)
    ? anyUser.portfolios
    : Array.isArray(anyUser.portfolio)
      ? anyUser.portfolio
      : [];

  return {
    professions,
    skills,
    interests,
    experience,
    availability,
    portfolio,
    profileEmbedding: anyUser.profileEmbedding ?? null,
    reputationScore: typeof anyUser.reputationScore === 'number' ? anyUser.reputationScore : 0.7,
  };
}

export function toPublicProfile(user: DBUser) {
  const dims = ensureDimensions(user);
  const { passwordHash, ...safe } = user as any;
  return {
    ...safe,
    ...dims,
    // keep legacy fields populated for old UI
    primaryRole: user.primaryRole || dims.professions[0] || 'other',
    secondaryRoles: user.secondaryRoles || dims.professions.slice(1),
  };
}

export class ProfileService {
  static getMe(userId: string) {
    const user = getUserById(userId);
    if (!user) return null;
    return toPublicProfile(user);
  }

  static updateMe(userId: string, patch: Record<string, unknown>) {
    const db = getDatabase();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) return null;

    const current = db.users[idx] as any;
    const next = { ...current };

    // Allowed top-level fields
    const allow = [
      'name',
      'bio',
      'city',
      'location',
      'avatarUrl',
      'coverImageUrl',
      'primaryRole',
      'secondaryRoles',
      'seekingRoles',
      'dayRateUsd',
      'hourlyRateUsd',
      'travelRadiusMiles',
      'communicationStyle',
      'gearItems',
      'workLinks',
      'socialLinks',
      'profileCompleted',
    ];
    for (const k of allow) {
      if (patch[k] !== undefined) next[k] = patch[k];
    }

    // Dimension fields
    if (Array.isArray(patch.professions)) {
      next.professions = (patch.professions as string[]).map((p) => normalizeProfession(p));
      // keep legacy in sync
      next.primaryRole = next.professions[0] || next.primaryRole;
      next.secondaryRoles = next.professions.slice(1);
    }
    if (patch.skills && typeof patch.skills === 'object') next.skills = patch.skills;
    if (patch.interests && typeof patch.interests === 'object') next.interests = patch.interests;
    if (patch.experience && typeof patch.experience === 'object') next.experience = patch.experience;
    if (patch.availability && typeof patch.availability === 'object') {
      next.availability = patch.availability;
    }
    if (Array.isArray(patch.portfolio)) next.portfolios = patch.portfolio;
    if (Array.isArray(patch.portfolios)) next.portfolios = patch.portfolios;

    next.updatedAt = new Date().toISOString();
    db.users[idx] = next;
    saveDatabase(db);
    // Dual-write to Firestore when configured (closes partial §12/16)
    if (isFirestoreEnabled()) {
      saveUser(userId, { ...next, passwordHash: undefined }).catch((e) =>
        console.warn('[ProfileService] Firestore dual-write failed:', e?.message || e)
      );
    }
    return toPublicProfile(next);
  }

  static putSkills(userId: string, skills: Record<string, number>) {
    return this.updateMe(userId, { skills });
  }

  static putInterests(userId: string, interests: Record<string, number>) {
    return this.updateMe(userId, { interests });
  }

  static putAvailability(userId: string, availability: AvailabilityModel) {
    return this.updateMe(userId, { availability });
  }

}
