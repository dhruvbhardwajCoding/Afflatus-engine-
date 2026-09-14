/**
 * Semantic retrieval helper (closes partial §19–21).
 * Uses profileEmbedding when present; else asks AI Backend to embed text.
 */
import { AiBackendClient } from './aiBackendClient';

function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0.5;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0.5;
  return (dot / (Math.sqrt(na) * Math.sqrt(nb)) + 1) / 2; // map [-1,1] → [0,1]
}

export function profileToText(p: any): string {
  return [
    p?.name,
    p?.bio,
    p?.primaryRole,
    ...(p?.professions || []),
    ...(p?.secondaryRoles || []),
    JSON.stringify(p?.skills || {}),
    JSON.stringify(p?.interests || {}),
    JSON.stringify(p?.experience || {}),
    p?.location || p?.city || '',
    (p?.genres || []).join(' '),
  ]
    .filter(Boolean)
    .join(' | ');
}

export function projectToText(req: {
  location?: string | null;
  projectType?: string | null;
  genres?: string[];
  requiredRoles?: string[];
}): string {
  return [
    req.projectType,
    ...(req.genres || []),
    ...(req.requiredRoles || []),
    req.location,
  ]
    .filter(Boolean)
    .join(' | ');
}

export class SemanticService {
  static async projectEmbedding(req: {
    location?: string | null;
    projectType?: string | null;
    genres?: string[];
    requiredRoles?: string[];
  }): Promise<number[] | null> {
    const text = projectToText(req);
    const res = await AiBackendClient.embedProfile(text);
    return res.ok && res.embedding ? res.embedding : null;
  }

  static semanticScore(projectEmb: number[] | null, user: any): number {
    const emb = user?.profileEmbedding;
    if (projectEmb && Array.isArray(emb) && emb.length === projectEmb.length) {
      return cosine(projectEmb, emb);
    }
    // text overlap fallback
    const blob = profileToText(user).toLowerCase();
    const needles = projectToText({
      location: user?._projectLocation,
      projectType: user?._projectType,
      genres: user?._genres,
      requiredRoles: user?._roles,
    }).toLowerCase();
    // crude token overlap when no embeddings
    const tokens = needles.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    if (!tokens.length) return 0.5;
    const hits = tokens.filter((t) => blob.includes(t)).length;
    return Math.min(0.95, 0.35 + (hits / tokens.length) * 0.6);
  }
}
