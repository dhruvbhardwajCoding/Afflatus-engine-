/**
 * Predefined profession system (spec §3).
 * Extensible — add new entries without changing architecture.
 */
export const PROFESSIONS = [
  { id: 'director', label: 'Director' },
  { id: 'cinematographer', label: 'Cinematographer / Videographer' },
  { id: 'video_editor', label: 'Video Editor' },
  { id: 'writer', label: 'Writer / Screenwriter' },
  { id: 'producer', label: 'Producer' },
  { id: 'photographer', label: 'Photographer' },
  { id: 'actor', label: 'Actor / Performer' },
  { id: 'production_designer', label: 'Production Designer' },
  { id: 'gaffer', label: 'Gaffer / Lighting' },
  { id: 'sound_designer', label: 'Sound Designer' },
  { id: 'sound_recordist', label: 'Sound Recordist' },
  { id: 'makeup_artist', label: 'Makeup Artist' },
  { id: 'costume_stylist', label: 'Costume / Stylist' },
  { id: 'choreographer', label: 'Choreographer' },
  { id: 'drone_operator', label: 'Drone Operator' },
  { id: 'content_creator', label: 'Content Creator' },
  { id: 'colorist', label: 'Colorist' },
  { id: 'other', label: 'Other' },
] as const;

export type ProfessionId = (typeof PROFESSIONS)[number]['id'];

export const PROFESSION_IDS = PROFESSIONS.map((p) => p.id);

/** Map legacy free-form role strings → profession ids */
export function normalizeProfession(raw: string): ProfessionId {
  const s = (raw || '').toLowerCase().trim();
  if (!s) return 'other';
  if (s.includes('director of photography') || s.includes('cinematograph') || s === 'dp' || s.includes('videograph'))
    return 'cinematographer';
  if (s.includes('editor') || s.includes('edit')) return 'video_editor';
  if (s.includes('director') && !s.includes('photography')) return 'director';
  if (s.includes('writer') || s.includes('screenwrit') || s.includes('script')) return 'writer';
  if (s.includes('producer')) return 'producer';
  if (s.includes('photograph')) return 'photographer';
  if (s.includes('actor') || s.includes('performer')) return 'actor';
  if (s.includes('production designer') || s.includes('art director')) return 'production_designer';
  if (s.includes('gaffer') || s.includes('lighting')) return 'gaffer';
  if (s.includes('sound design')) return 'sound_designer';
  if (s.includes('sound record') || s.includes('location sound') || s.includes('boom')) return 'sound_recordist';
  if (s.includes('makeup') || s.includes('make-up')) return 'makeup_artist';
  if (s.includes('costume') || s.includes('stylist')) return 'costume_stylist';
  if (s.includes('choreograph')) return 'choreographer';
  if (s.includes('drone')) return 'drone_operator';
  if (s.includes('colorist') || s.includes('colourist') || s.includes('grading')) return 'colorist';
  if (s.includes('content creator') || s.includes('influencer')) return 'content_creator';
  const exact = PROFESSIONS.find((p) => p.id === s || p.label.toLowerCase() === s);
  return exact ? exact.id : 'other';
}

export const GENRES = [
  'horror',
  'thriller',
  'drama',
  'comedy',
  'action',
  'romance',
  'sci-fi',
  'fantasy',
  'documentary',
] as const;

export type GenreId = (typeof GENRES)[number];
