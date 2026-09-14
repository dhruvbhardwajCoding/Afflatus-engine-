/**
 * Experience model (spec §5–6).
 * Calculated from project history — not a single manual number.
 * Uses diminishing returns: project_score = 1 - exp(-projects / 10)
 */
import { getDatabase, saveDatabase, getUserById } from '../db';
import type { DBUser } from '../types';

export interface PastProjectEntry {
  id: string;
  projectType: string; // short_film, commercial, music_video, documentary, feature, ...
  genres: string[];
  role: string;
  responsibility?: string;
  date?: string;
  duration?: string;
  portfolioUrl?: string;
  description?: string;
}

/** 1 - e^(-n/10)  → asymptotic approach to 1 */
function diminish(count: number, scale = 10): number {
  if (count <= 0) return 0;
  return 1 - Math.exp(-count / scale);
}

function recencyWeight(dateStr?: string): number {
  if (!dateStr) return 0.7;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return 0.7;
  const yearsAgo = (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
  if (yearsAgo < 1) return 1;
  if (yearsAgo < 3) return 0.85;
  if (yearsAgo < 5) return 0.7;
  return 0.5;
}

function roleDepth(responsibility?: string): number {
  if (!responsibility) return 0.6;
  const r = responsibility.toLowerCase();
  if (r.includes('full') || r.includes('lead') || r.includes('head')) return 1;
  if (r.includes('co-') || r.includes('assistant')) return 0.5;
  return 0.75;
}

export class ExperienceService {
  static getPastProjects(userId: string): PastProjectEntry[] {
    const user = getUserById(userId) as any;
    if (!user) return [];
    return Array.isArray(user.pastProjects) ? user.pastProjects : [];
  }

  static addPastProject(userId: string, entry: Omit<PastProjectEntry, 'id'> & { id?: string }) {
    const db = getDatabase();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) return null;

    const user = db.users[idx] as any;
    const list: PastProjectEntry[] = Array.isArray(user.pastProjects) ? [...user.pastProjects] : [];
    const item: PastProjectEntry = {
      id: entry.id || `pp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectType: entry.projectType || 'short_film',
      genres: Array.isArray(entry.genres) ? entry.genres : [],
      role: entry.role || 'other',
      responsibility: entry.responsibility,
      date: entry.date,
      duration: entry.duration,
      portfolioUrl: entry.portfolioUrl,
      description: entry.description,
    };
    list.push(item);
    user.pastProjects = list;
    user.experience = this.calculate(list);
    user.updatedAt = new Date().toISOString();
    db.users[idx] = user;
    saveDatabase(db);
    return { pastProjects: list, experience: user.experience };
  }

  static updatePastProject(userId: string, projectId: string, patch: Partial<PastProjectEntry>) {
    const db = getDatabase();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) return null;
    const user = db.users[idx] as any;
    const list: PastProjectEntry[] = Array.isArray(user.pastProjects) ? [...user.pastProjects] : [];
    const pIdx = list.findIndex((p) => p.id === projectId);
    if (pIdx < 0) return null;
    list[pIdx] = { ...list[pIdx], ...patch, id: projectId };
    user.pastProjects = list;
    user.experience = this.calculate(list);
    user.updatedAt = new Date().toISOString();
    db.users[idx] = user;
    saveDatabase(db);
    return { pastProjects: list, experience: user.experience };
  }

  static deletePastProject(userId: string, projectId: string) {
    const db = getDatabase();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) return null;
    const user = db.users[idx] as any;
    const list: PastProjectEntry[] = (Array.isArray(user.pastProjects) ? user.pastProjects : []).filter(
      (p: PastProjectEntry) => p.id !== projectId
    );
    user.pastProjects = list;
    user.experience = this.calculate(list);
    user.updatedAt = new Date().toISOString();
    db.users[idx] = user;
    saveDatabase(db);
    return { pastProjects: list, experience: user.experience };
  }

  /**
   * Returns experience dimensions:
   * { overall, horror, thriller, commercial, music_video, documentary, ... }
   */
  static calculate(projects: PastProjectEntry[]): Record<string, number> {
    if (!projects.length) {
      return { overall: 0.1 };
    }

    let weightedCount = 0;
    const genreCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    let yearsSpan = 0;

    const dates = projects
      .map((p) => (p.date ? Date.parse(p.date) : NaN))
      .filter((t) => !Number.isNaN(t));
    if (dates.length >= 2) {
      yearsSpan = (Math.max(...dates) - Math.min(...dates)) / (365.25 * 24 * 3600 * 1000);
    } else if (dates.length === 1) {
      yearsSpan = Math.max(0.5, (Date.now() - dates[0]) / (365.25 * 24 * 3600 * 1000));
    }

    for (const p of projects) {
      const w = recencyWeight(p.date) * roleDepth(p.responsibility);
      weightedCount += w;
      for (const g of p.genres || []) {
        const key = g.toLowerCase().replace(/\s+/g, '_');
        genreCounts[key] = (genreCounts[key] || 0) + w;
      }
      const t = (p.projectType || 'other').toLowerCase().replace(/\s+/g, '_');
      typeCounts[t] = (typeCounts[t] || 0) + w;
    }

    const overall =
      0.55 * diminish(weightedCount, 10) +
      0.25 * diminish(yearsSpan, 8) +
      0.2 * diminish(projects.length, 12);

    const experience: Record<string, number> = {
      overall: Math.min(0.99, Math.round(overall * 1000) / 1000),
    };

    for (const [g, c] of Object.entries(genreCounts)) {
      experience[g] = Math.min(0.99, Math.round(diminish(c, 6) * 1000) / 1000);
    }
    for (const [t, c] of Object.entries(typeCounts)) {
      // type keys don't overwrite genre keys of same name
      if (experience[t] === undefined) {
        experience[t] = Math.min(0.99, Math.round(diminish(c, 6) * 1000) / 1000);
      }
    }

    return experience;
  }

  /** Recalculate and persist for a user */
  static recalculate(userId: string) {
    const projects = this.getPastProjects(userId);
    const experience = this.calculate(projects);
    const db = getDatabase();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) return null;
    (db.users[idx] as any).experience = experience;
    (db.users[idx] as any).updatedAt = new Date().toISOString();
    saveDatabase(db);
    return experience;
  }
}
