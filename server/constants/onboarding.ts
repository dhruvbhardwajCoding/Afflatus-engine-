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
    extraQuestions?: Array<{ id: string; label: string; type: 'multi' | 'single' | 'text' | 'scale' }>;
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
  const universalQuestions: Array<{ id: string; label: string; type: 'multi' | 'single' | 'text' | 'scale' | 'number', options?: string[] }> = [
    { id: 'yearsActive', label: 'How many years have you been active in this role?', type: 'number' },
    { id: 'projectsCompleted', label: 'Roughly how many projects have you completed?', type: 'number' },
    { id: 'roleSpecificProjects', label: 'How many of those were specifically in this primary role?', type: 'number' },
    { id: 'scenario_q1', label: 'You strongly disagree with the creative direction chosen by someone leading your project. What would you do?', type: 'text' },
    { id: 'scenario_q2', label: 'Someone gives you critical feedback about your work. How do you usually respond?', type: 'text' },
    { id: 'scenario_q3', label: 'Your team is behind schedule and your task is taking longer than expected. What would you do?', type: 'text' },
    { id: 'scenario_q4', label: 'Which collaboration style describes you best?', type: 'single', options: [
      'Prefer clear direction and execute it',
      'Discuss ideas and shape the direction together',
      'Prefer taking ownership and proposing my own direction',
      'Depends on the project'
    ]},
    { id: 'scenario_q5', label: 'What qualities do you value most in someone you collaborate with?', type: 'text' }
  ];

  return professionIds.map((id) => {
    const prof = PROFESSION_ONBOARDING[id] || PROFESSION_ONBOARDING.other;
    return {
      professionId: id,
      ...prof,
      extraQuestions: [...(prof.extraQuestions || []), ...universalQuestions]
    };
  });
}
