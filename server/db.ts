import fs from 'fs';
import path from 'path';
import type { DatabaseSchema, DBUser, Project, ProjectTask, CreativeClub, WorkShowcase } from './types';
import type { CreatorProfile } from '../shared/types/index';
import { SEED_PROJECTS, SEED_TASKS, SEED_CLUBS, SEED_WORKS } from './seeds';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

let inMemoryDb: DatabaseSchema | null = null;

export function getDatabase(): DatabaseSchema {
  if (inMemoryDb) {
    return inMemoryDb;
  }
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users)) {
        inMemoryDb = {
          users: parsed.users,
          connections: Array.isArray(parsed.connections) ? parsed.connections : [],
          projects: Array.isArray(parsed.projects) && parsed.projects.length > 0 ? parsed.projects : [...SEED_PROJECTS],
          tasks: Array.isArray(parsed.tasks) && parsed.tasks.length > 0 ? parsed.tasks : [...SEED_TASKS],
          clubs: Array.isArray(parsed.clubs) && parsed.clubs.length > 0 ? parsed.clubs : [...SEED_CLUBS],
          workShowcases: Array.isArray(parsed.workShowcases) && parsed.workShowcases.length > 0 ? parsed.workShowcases : [...SEED_WORKS],
          matches: Array.isArray(parsed.matches) ? parsed.matches : [],
          workspaces: parsed.workspaces || {},
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        };
        // If projects, tasks, or clubs were missing from file, persist updated schema
        if (!parsed.projects || parsed.projects.length === 0 || !parsed.tasks || !parsed.clubs || !parsed.workShowcases) {
          saveDatabase(inMemoryDb);
        }
        return inMemoryDb;
      }
    }
  } catch (err) {
    console.warn('[DB] Error loading database, using default seeded state:', err);
  }

  inMemoryDb = {
    users: [],
    connections: [],
    projects: [...SEED_PROJECTS],
    tasks: [...SEED_TASKS],
    clubs: [...SEED_CLUBS],
    workShowcases: [...SEED_WORKS],
    matches: [],
    workspaces: {},
    posts: [],
  };
  return inMemoryDb;
}

export function saveDatabase(db?: DatabaseSchema): void {
  const target = db || inMemoryDb;
  if (!target) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(target, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Failed to save database to disk:', err);
  }
}

export function getAllUsers(): DBUser[] {
  return getDatabase().users;
}

export function getUserById(id: string): DBUser | undefined {
  return getDatabase().users.find((u) => u.id === id);
}

export function getAllProjects(): Project[] {
  const db = getDatabase();
  const users = db.users;
  return db.projects.map((p) => {
    const seeker = users.find((u) => u.id === p.seekerId);
    const collaborators = (p.collaboratorIds || [])
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is CreatorProfile => Boolean(u));
    return { ...p, seeker, collaborators };
  });
}

export function getProjectById(id: string): Project | undefined {
  const projects = getAllProjects();
  return projects.find((p) => p.id === id);
}

export function getAllTasks(): ProjectTask[] {
  const db = getDatabase();
  const users = db.users;
  return db.tasks.map((t) => {
    const creator = users.find((u) => u.id === t.creatorId);
    return { ...t, creator };
  });
}

export function getTaskById(id: string): ProjectTask | undefined {
  const tasks = getAllTasks();
  return tasks.find((t) => t.id === id);
}

export function getAllClubs(): CreativeClub[] {
  const db = getDatabase();
  const users = db.users;
  return db.clubs.map((c) => {
    const leadCreator = users.find((u) => u.id === c.leadCreatorId);
    return { ...c, leadCreator };
  });
}

export function getClubById(id: string): CreativeClub | undefined {
  const clubs = getAllClubs();
  return clubs.find((c) => c.id === id);
}

export function getAllWorkShowcases(): WorkShowcase[] {
  const db = getDatabase();
  const users = db.users;
  return db.workShowcases.map((w) => {
    const creator = users.find((u) => u.id === w.creatorId);
    const collaborators = (w.collaboratorIds || [])
      .map((id) => users.find((u) => u.id === id))
      .filter((u): u is CreatorProfile => Boolean(u));
    const parentProject = w.projectId ? db.projects.find((p) => p.id === w.projectId) : undefined;
    return {
      ...w,
      creator,
      collaborators,
      projectTitle: w.projectTitle || parentProject?.title,
    };
  });
}

export function getWorkShowcaseById(id: string): WorkShowcase | undefined {
  const works = getAllWorkShowcases();
  return works.find((w) => w.id === id);
}

export function getCreatorPublicWorkAndProjects(creatorId: string) {
  const rawCreator = getUserById(creatorId);
  if (!rawCreator) return null;

  // Sanitize non-sensitive public profile info (do not expose email, auth, or private fields)
  const { email, passwordHash, emergencyContact, ...publicCreator } = rawCreator as any;

  const allProjects = getAllProjects();
  const allWorks = getAllWorkShowcases();

  const leadProjects = allProjects.filter((p) => p.seekerId === creatorId);
  const participatedProjects = allProjects.filter(
    (p) => (p.collaboratorIds || []).includes(creatorId) && p.seekerId !== creatorId
  );
  const works = allWorks.filter(
    (w) => w.creatorId === creatorId || (w.collaboratorIds || []).includes(creatorId)
  );

  return {
    creator: publicCreator as CreatorProfile,
    leadProjects,
    participatedProjects,
    works,
  };
}

export function addConnection(conn: {
  senderId: string;
  recipientId: string;
  message: string;
  projectId?: string;
  taskId?: string;
}) {
  const db = getDatabase();

  // Prevent accidental duplicate connection / application requests
  const existing = db.connections.find((c) => {
    if (c.senderId !== conn.senderId || c.recipientId !== conn.recipientId) return false;
    if (conn.taskId && c.taskId === conn.taskId) return true;
    if (conn.projectId && !conn.taskId && c.projectId === conn.projectId) return true;
    if (!conn.taskId && !conn.projectId && !c.taskId && !c.projectId) return true;
    return false;
  });

  if (existing) {
    return {
      ...existing,
      alreadyExists: true,
    };
  }

  const newConn = {
    id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    senderId: conn.senderId,
    recipientId: conn.recipientId,
    message: conn.message,
    projectId: conn.projectId,
    taskId: conn.taskId,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };
  db.connections.push(newConn);
  saveDatabase(db);
  return newConn;
}

export function getConnections(userId?: string) {
  const db = getDatabase();
  if (!userId) return db.connections;
  return db.connections.filter((c) => c.senderId === userId || c.recipientId === userId);
}
