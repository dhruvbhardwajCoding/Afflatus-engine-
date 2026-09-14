/**
 * Full profession onboarding flows (spec §3).
 * After selecting profession(s), client asks these question sets.
 */
export const PROFESSION_ONBOARDING: Record<
  string,
  {
    label: string;
    projectTypes: string[];
    genres?: string[];
    skills?: string[];
    extraQuestions?: Array<{ id: string; label: string; type: 'multi' | 'single' | 'text' }>;
  }
> = {
  director: {
    label: 'Director',
    projectTypes: [
      'short_film',
      'feature',
      'commercial',
      'music_video',
      'documentary',
      'youtube',
      'corporate',
      'experimental',
    ],
    genres: [
      'horror',
      'thriller',
      'drama',
      'comedy',
      'action',
      'romance',
      'sci-fi',
      'fantasy',
      'documentary',
    ],
    skills: ['direction', 'screenwriting', 'producing'],
    extraQuestions: [
      { id: 'preferred_crew_size', label: 'Preferred crew size', type: 'single' },
      { id: 'directing_style', label: 'Directing style notes', type: 'text' },
    ],
  },
  cinematographer: {
    label: 'Cinematographer / Videographer',
    projectTypes: [
      'short_film',
      'commercial',
      'music_video',
      'wedding',
      'documentary',
      'product',
      'fashion',
      'travel',
      'sports',
    ],
    genres: ['horror', 'thriller', 'drama', 'comedy', 'commercial'],
    skills: ['camera', 'lighting', 'gimbal', 'drone', 'color_grading', 'photography'],
    extraQuestions: [
      { id: 'camera_bodies', label: 'Camera bodies you own/operate', type: 'multi' },
      { id: 'lens_mounts', label: 'Lens mounts', type: 'multi' },
    ],
  },
  video_editor: {
    label: 'Video Editor',
    projectTypes: ['short_film', 'commercial', 'music_video', 'youtube', 'documentary'],
    genres: ['horror', 'thriller', 'drama', 'comedy', 'commercial'],
    skills: ['editing', 'color_grading', 'sound_design'],
    extraQuestions: [
      { id: 'nle', label: 'NLEs (Premiere, Resolve, Avid, FCP)', type: 'multi' },
    ],
  },
  writer: {
    label: 'Writer / Screenwriter',
    projectTypes: ['short_film', 'feature', 'commercial', 'web_series'],
    genres: ['horror', 'thriller', 'drama', 'comedy', 'sci-fi', 'romance'],
    skills: ['screenwriting'],
  },
  producer: {
    label: 'Producer',
    projectTypes: ['short_film', 'feature', 'commercial', 'music_video', 'documentary'],
    skills: ['producing'],
    extraQuestions: [
      { id: 'budget_tiers', label: 'Budget tiers you have produced', type: 'multi' },
    ],
  },
  sound_designer: {
    label: 'Sound Designer',
    projectTypes: ['short_film', 'feature', 'commercial', 'music_video'],
    skills: ['sound_design', 'sound_recording'],
  },
  sound_recordist: {
    label: 'Sound Recordist',
    projectTypes: ['short_film', 'feature', 'commercial', 'documentary'],
    skills: ['sound_recording'],
  },
  actor: {
    label: 'Actor / Performer',
    projectTypes: ['short_film', 'feature', 'commercial', 'music_video'],
    genres: ['horror', 'thriller', 'drama', 'comedy', 'action', 'romance'],
  },
  photographer: {
    label: 'Photographer',
    projectTypes: ['fashion', 'product', 'wedding', 'travel', 'commercial'],
    skills: ['photography', 'lighting'],
  },
  gaffer: {
    label: 'Gaffer / Lighting',
    projectTypes: ['short_film', 'commercial', 'music_video'],
    skills: ['lighting'],
  },
  colorist: {
    label: 'Colorist',
    projectTypes: ['short_film', 'commercial', 'music_video', 'feature'],
    skills: ['color_grading'],
  },
  content_creator: {
    label: 'Content Creator',
    projectTypes: ['youtube', 'social', 'commercial'],
    skills: ['editing', 'camera', 'direction'],
  },
  other: {
    label: 'Other',
    projectTypes: ['short_film', 'commercial', 'other'],
    skills: [],
  },
};

export function getOnboardingForProfessions(professionIds: string[]) {
  return professionIds.map((id) => ({
    professionId: id,
    ...(PROFESSION_ONBOARDING[id] || PROFESSION_ONBOARDING.other),
  }));
}
