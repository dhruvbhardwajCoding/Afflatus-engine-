/**
 * Unified data store: Firestore when Admin is configured, else in-memory JSON.
 * Lets local dev work without credentials; production uses real Firestore.
 */
import {
  isFirestoreEnabled,
  fsGet,
  fsSet,
  fsAdd,
  fsUpdate,
  fsDelete,
  fsList,
  fsQuery,
} from './firestoreService';
import { getDatabase, saveDatabase, getUserById as memGetUser } from '../db';

export { isFirestoreEnabled };

export async function getUser(id: string) {
  if (isFirestoreEnabled()) {
    return fsGet('users', id);
  }
  return memGetUser(id) || null;
}

export async function listUsers(limit = 200) {
  if (isFirestoreEnabled()) {
    return fsList('users', limit);
  }
  return getDatabase().users || [];
}

export async function saveUser(id: string, data: Record<string, unknown>) {
  if (isFirestoreEnabled()) {
    return fsSet('users', id, data, true);
  }
  const db = getDatabase();
  const idx = db.users.findIndex((u) => u.id === id);
  const next = { ...data, id } as any;
  if (idx >= 0) db.users[idx] = { ...db.users[idx], ...next };
  else db.users.push(next);
  saveDatabase(db);
  return next;
}

export async function listProjects(limit = 200) {
  if (isFirestoreEnabled()) {
    const app = await fsList('projects', limit);
    return app;
  }
  const db = getDatabase() as any;
  return [...(db.appProjects || []), ...(db.projects || [])];
}

export async function getProject(id: string) {
  if (isFirestoreEnabled()) return fsGet('projects', id);
  const db = getDatabase() as any;
  return (
    (db.appProjects || []).find((p: any) => p.id === id) ||
    (db.projects || []).find((p: any) => p.id === id) ||
    null
  );
}

export async function saveProject(id: string, data: Record<string, unknown>) {
  if (isFirestoreEnabled()) return fsSet('projects', id, data, true);
  const db = getDatabase() as any;
  if (!db.appProjects) db.appProjects = [];
  const idx = db.appProjects.findIndex((p: any) => p.id === id);
  const next = { ...data, id };
  if (idx >= 0) db.appProjects[idx] = { ...db.appProjects[idx], ...next };
  else db.appProjects.push(next);
  saveDatabase(db);
  return next;
}

export async function addProject(data: Record<string, unknown>) {
  if (isFirestoreEnabled()) return fsAdd('projects', data);
  const id = `proj_${Date.now()}`;
  return saveProject(id, { ...data, id });
}

export async function deleteProject(id: string) {
  if (isFirestoreEnabled()) return fsDelete('projects', id);
  const db = getDatabase() as any;
  db.appProjects = (db.appProjects || []).filter((p: any) => p.id !== id);
  saveDatabase(db);
  return { ok: true };
}

export async function listInvitations(filters: { inviteeId?: string; inviterId?: string } = {}) {
  if (isFirestoreEnabled()) {
    if (filters.inviteeId) {
      return fsQuery('invitations', [{ field: 'inviteeId', op: '==', value: filters.inviteeId }]);
    }
    if (filters.inviterId) {
      return fsQuery('invitations', [{ field: 'inviterId', op: '==', value: filters.inviterId }]);
    }
    return fsList('invitations');
  }
  const db = getDatabase() as any;
  let list = db.invitations || [];
  if (filters.inviteeId) list = list.filter((i: any) => i.inviteeId === filters.inviteeId);
  if (filters.inviterId) list = list.filter((i: any) => i.inviterId === filters.inviterId);
  return list;
}

export async function saveInvitation(id: string, data: Record<string, unknown>) {
  if (isFirestoreEnabled()) return fsSet('invitations', id, data, true);
  const db = getDatabase() as any;
  if (!db.invitations) db.invitations = [];
  const idx = db.invitations.findIndex((i: any) => i.id === id);
  const next = { ...data, id };
  if (idx >= 0) db.invitations[idx] = next;
  else db.invitations.push(next);
  saveDatabase(db);
  return next;
}

export async function addInvitation(data: Record<string, unknown>) {
  if (isFirestoreEnabled()) return fsAdd('invitations', data);
  const id = `inv_${Date.now()}`;
  return saveInvitation(id, { ...data, id });
}

/**
 * Seed demo creators into Firestore (or memory) for client demos.
 */
export async function seedDemoCreators() {
  const demos = [
    {
      id: 'demo_rahul_dp',
      name: 'Rahul Mehta',
      email: 'rahul.dp@demo.affil',
      city: 'Bhopal',
      location: 'Bhopal, Madhya Pradesh',
      professions: ['cinematographer'],
      primaryRole: 'Cinematographer',
      secondaryRoles: ['Colorist'],
      bio: 'Horror and thriller cinematographer based in Bhopal. Anamorphic, low-key lighting.',
      skills: { cinematography: 0.92, lighting: 0.88, color_grading: 0.7 },
      interests: { horror: 0.95, thriller: 0.9, drama: 0.5 },
      experience: { overall: 0.75, horror: 0.85, thriller: 0.8 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.82,
    },
    {
      id: 'demo_priya_editor',
      name: 'Priya Sharma',
      email: 'priya.edit@demo.affil',
      city: 'Bhopal',
      location: 'Bhopal, Madhya Pradesh',
      professions: ['video_editor'],
      primaryRole: 'Video Editor',
      secondaryRoles: [],
      bio: 'Editor specializing in dark narrative shorts and music videos.',
      skills: { editing: 0.9, color_grading: 0.75 },
      interests: { horror: 0.8, thriller: 0.85, drama: 0.7 },
      experience: { overall: 0.7, horror: 0.72, thriller: 0.78 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.8,
    },
    {
      id: 'demo_arjun_sound',
      name: 'Arjun Verma',
      email: 'arjun.sound@demo.affil',
      city: 'Bhopal',
      location: 'Bhopal, Madhya Pradesh',
      professions: ['sound_designer', 'sound_recordist'],
      primaryRole: 'Sound Designer',
      secondaryRoles: ['Sound Recordist'],
      bio: 'Location sound and design for indie horror.',
      skills: { sound_design: 0.88, sound_recording: 0.9 },
      interests: { horror: 0.9, thriller: 0.7 },
      experience: { overall: 0.65, horror: 0.8 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.78,
    },
    {
      id: 'demo_neha_director',
      name: 'Neha Kapoor',
      email: 'neha.dir@demo.affil',
      city: 'Mumbai',
      location: 'Mumbai, Maharashtra',
      professions: ['director', 'writer'],
      primaryRole: 'Director',
      secondaryRoles: ['Writer'],
      bio: 'Director of psychological horror shorts.',
      skills: { direction: 0.9, screenwriting: 0.85 },
      interests: { horror: 0.95, thriller: 0.9, drama: 0.6 },
      experience: { overall: 0.8, horror: 0.88 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.86,
    },
    {
      id: 'demo_vikram_dp',
      name: 'Vikram Singh',
      email: 'vikram.dp@demo.affil',
      city: 'Mumbai',
      location: 'Mumbai, Maharashtra',
      professions: ['cinematographer'],
      primaryRole: 'Director of Photography (DP)',
      secondaryRoles: ['Gaffer'],
      bio: 'Commercial and narrative DP, Mumbai.',
      skills: { cinematography: 0.93, lighting: 0.9, camera: 0.92 },
      interests: { commercial: 0.85, drama: 0.7, horror: 0.5 },
      experience: { overall: 0.85, commercial: 0.9, horror: 0.45 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.88,
    },
    {
      id: 'demo_sara_editor_mum',
      name: 'Sara Khan',
      email: 'sara.edit@demo.affil',
      city: 'Mumbai',
      location: 'Mumbai, Maharashtra',
      professions: ['video_editor'],
      primaryRole: 'Video Editor',
      secondaryRoles: ['Colorist'],
      bio: 'Editor for commercials and short films.',
      skills: { editing: 0.91, color_grading: 0.8 },
      interests: { commercial: 0.8, drama: 0.75, horror: 0.4 },
      experience: { overall: 0.78, commercial: 0.85 },
      availability: { status: 'available' },
      profileCompleted: true,
      reputationScore: 0.84,
    },
  ];

  const results = [];
  for (const u of demos) {
    await saveUser(u.id, u as any);
    results.push(u.id);
  }
  return {
    mode: isFirestoreEnabled() ? 'firestore' : 'memory',
    seeded: results.length,
    ids: results,
  };
}
