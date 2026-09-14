/**
 * Projects + invitations + members (spec §18, §26–27).
 */
import { getDatabase, saveDatabase, getUserById } from '../db';
import { CollaborationService } from './collaborationService';
import { NotificationService } from './notificationService';

export type ProjectStatus =
  | 'draft'
  | 'discovering_team'
  | 'inviting'
  | 'active'
  | 'completed'
  | 'cancelled';

export interface AppProject {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  location?: { city?: string; raw?: string };
  projectType?: string;
  genres: string[];
  requiredRoles: string[];
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
  memberIds: string[];
  createdAt: string;
  updatedAt?: string;
  // legacy compatibility
  seekerId?: string;
  budgetUsd?: number;
  timeline?: string;
  rawTextBrief?: string;
  genreTags?: string[];
  collaboratorIds?: string[];
}

export interface Invitation {
  id: string;
  projectId: string;
  inviterId: string;
  inviteeId: string;
  role?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

function ensureCollections(db: any) {
  if (!Array.isArray(db.appProjects)) db.appProjects = [];
  if (!Array.isArray(db.invitations)) db.invitations = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.collaborations)) db.collaborations = [];
}

function legacyToApp(p: any): AppProject {
  return {
    id: p.id,
    ownerId: p.ownerId || p.seekerId,
    title: p.title,
    description: p.description || p.rawTextBrief || '',
    location: typeof p.location === 'object' ? p.location : { city: p.location, raw: p.location },
    projectType: p.projectType || 'short_film',
    genres: p.genres || p.genreTags || [],
    requiredRoles: p.requiredRoles || [],
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    status: p.status || 'discovering_team',
    memberIds: p.memberIds || [p.ownerId || p.seekerId, ...(p.collaboratorIds || [])].filter(Boolean),
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt,
    seekerId: p.seekerId || p.ownerId,
    budgetUsd: p.budgetUsd,
    timeline: p.timeline,
    rawTextBrief: p.rawTextBrief,
    genreTags: p.genreTags || p.genres,
    collaboratorIds: p.collaboratorIds || p.memberIds,
  };
}

export class ProjectService {
  static listForUser(userId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const fromApp = (db.appProjects as AppProject[]).filter(
      (p) => p.ownerId === userId || (p.memberIds || []).includes(userId)
    );
    const fromLegacy = (db.projects || [])
      .filter((p: any) => p.seekerId === userId || (p.collaboratorIds || []).includes(userId))
      .map(legacyToApp);
    const map = new Map<string, AppProject>();
    for (const p of [...fromLegacy, ...fromApp]) map.set(p.id, p);
    return Array.from(map.values());
  }

  static getById(projectId: string): AppProject | null {
    const db = getDatabase() as any;
    ensureCollections(db);
    const app = (db.appProjects as AppProject[]).find((p) => p.id === projectId);
    if (app) return app;
    const legacy = (db.projects || []).find((p: any) => p.id === projectId);
    return legacy ? legacyToApp(legacy) : null;
  }

  static create(ownerId: string, body: Partial<AppProject>) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const id = body.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const project: AppProject = {
      id,
      ownerId,
      title: body.title || 'Untitled Project',
      description: body.description || '',
      location:
        typeof body.location === 'object'
          ? body.location
          : { city: (body as any).location || '', raw: (body as any).location || '' },
      projectType: body.projectType || 'short_film',
      genres: body.genres || body.genreTags || [],
      requiredRoles: body.requiredRoles || [],
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      status: body.status || 'discovering_team',
      memberIds: [ownerId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      seekerId: ownerId,
      budgetUsd: body.budgetUsd,
      timeline: body.timeline,
      rawTextBrief: body.rawTextBrief || body.description,
      genreTags: body.genres || body.genreTags || [],
      collaboratorIds: [],
    };
    db.appProjects.push(project);
    saveDatabase(db);
    return project;
  }

  static update(projectId: string, userId: string, patch: Partial<AppProject>) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const idx = (db.appProjects as AppProject[]).findIndex((p) => p.id === projectId);
    if (idx < 0) {
      // try migrate legacy
      const legacy = (db.projects || []).find((p: any) => p.id === projectId);
      if (!legacy) return null;
      if ((legacy.seekerId || legacy.ownerId) !== userId) return { error: 'forbidden' as const };
      const migrated = { ...legacyToApp(legacy), ...patch, updatedAt: new Date().toISOString() };
      db.appProjects.push(migrated);
      saveDatabase(db);
      return migrated;
    }
    const current = db.appProjects[idx];
    if (current.ownerId !== userId) return { error: 'forbidden' as const };
    const next = {
      ...current,
      ...patch,
      id: projectId,
      ownerId: current.ownerId,
      updatedAt: new Date().toISOString(),
    };
    db.appProjects[idx] = next;
    saveDatabase(db);
    return next;
  }

  static remove(projectId: string, userId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const idx = (db.appProjects as AppProject[]).findIndex((p) => p.id === projectId);
    if (idx < 0) return null;
    if (db.appProjects[idx].ownerId !== userId) return { error: 'forbidden' as const };
    db.appProjects.splice(idx, 1);
    // cascade invitations
    db.invitations = (db.invitations as Invitation[]).filter((i) => i.projectId !== projectId);
    saveDatabase(db);
    return { ok: true };
  }

  static getMembers(projectId: string) {
    const project = this.getById(projectId);
    if (!project) return null;
    return (project.memberIds || [])
      .map((id) => getUserById(id))
      .filter(Boolean)
      .map((u) => {
        const { passwordHash, ...safe } = u as any;
        return safe;
      });
  }

  static addMember(projectId: string, ownerId: string, memberId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    let idx = (db.appProjects as AppProject[]).findIndex((p) => p.id === projectId);
    if (idx < 0) return null;
    const p = db.appProjects[idx];
    if (p.ownerId !== ownerId) return { error: 'forbidden' as const };
    if (!(p.memberIds || []).includes(memberId)) {
      p.memberIds = [...(p.memberIds || []), memberId];
      p.collaboratorIds = (p.memberIds || []).filter((id: string) => id !== p.ownerId);
      p.updatedAt = new Date().toISOString();
      db.appProjects[idx] = p;
      saveDatabase(db);
    }
    return p;
  }

  static removeMember(projectId: string, ownerId: string, memberId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const idx = (db.appProjects as AppProject[]).findIndex((p) => p.id === projectId);
    if (idx < 0) return null;
    const p = db.appProjects[idx];
    if (p.ownerId !== ownerId) return { error: 'forbidden' as const };
    if (memberId === p.ownerId) return { error: 'cannot_remove_owner' as const };
    p.memberIds = (p.memberIds || []).filter((id: string) => id !== memberId);
    p.collaboratorIds = p.memberIds.filter((id: string) => id !== p.ownerId);
    p.updatedAt = new Date().toISOString();
    db.appProjects[idx] = p;
    saveDatabase(db);
    return p;
  }

  // ---- Invitations ----
  static createInvitation(input: {
    projectId: string;
    inviterId: string;
    inviteeId: string;
    role?: string;
    message?: string;
  }) {
    const project = this.getById(input.projectId);
    if (!project) return { error: 'project_not_found' as const };
    if (project.ownerId !== input.inviterId && !(project.memberIds || []).includes(input.inviterId)) {
      return { error: 'forbidden' as const };
    }
    if (!getUserById(input.inviteeId)) return { error: 'invitee_not_found' as const };

    const db = getDatabase() as any;
    ensureCollections(db);
    const invitation: Invitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: input.projectId,
      inviterId: input.inviterId,
      inviteeId: input.inviteeId,
      role: input.role,
      message: input.message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.invitations.push(invitation);
    saveDatabase(db);

    // notification
    NotificationService.create({
      userId: input.inviteeId,
      type: 'invitation',
      title: 'New project invitation',
      body: `${getUserById(input.inviterId)?.name || 'Someone'} invited you to "${project.title}"`,
      data: { invitationId: invitation.id, projectId: project.id },
    });

    return invitation;
  }

  static listInvitationsForUser(userId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    return (db.invitations as Invitation[])
      .filter((i) => i.inviteeId === userId || i.inviterId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static acceptInvitation(invitationId: string, userId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const idx = (db.invitations as Invitation[]).findIndex((i) => i.id === invitationId);
    if (idx < 0) return { error: 'not_found' as const };
    const inv = db.invitations[idx];
    if (inv.inviteeId !== userId) return { error: 'forbidden' as const };
    if (inv.status !== 'pending') return { error: 'not_pending' as const };

    inv.status = 'accepted';
    inv.updatedAt = new Date().toISOString();
    db.invitations[idx] = inv;

    // add member
    const pIdx = (db.appProjects as AppProject[]).findIndex((p) => p.id === inv.projectId);
    if (pIdx >= 0) {
      const p = db.appProjects[pIdx];
      if (!(p.memberIds || []).includes(userId)) {
        p.memberIds = [...(p.memberIds || []), userId];
        p.collaboratorIds = p.memberIds.filter((id: string) => id !== p.ownerId);
        p.updatedAt = new Date().toISOString();
        db.appProjects[pIdx] = p;
      }
    }
    saveDatabase(db);

    NotificationService.create({
      userId: inv.inviterId,
      type: 'invitation_accepted',
      title: 'Invitation accepted',
      body: `${getUserById(userId)?.name || 'Someone'} accepted your invitation`,
      data: { invitationId: inv.id, projectId: inv.projectId },
    });

    return inv;
  }

  static rejectInvitation(invitationId: string, userId: string) {
    const db = getDatabase() as any;
    ensureCollections(db);
    const idx = (db.invitations as Invitation[]).findIndex((i) => i.id === invitationId);
    if (idx < 0) return { error: 'not_found' as const };
    const inv = db.invitations[idx];
    if (inv.inviteeId !== userId) return { error: 'forbidden' as const };
    if (inv.status !== 'pending') return { error: 'not_pending' as const };
    inv.status = 'rejected';
    inv.updatedAt = new Date().toISOString();
    db.invitations[idx] = inv;
    saveDatabase(db);

    NotificationService.create({
      userId: inv.inviterId,
      type: 'invitation_rejected',
      title: 'Invitation declined',
      body: `${getUserById(userId)?.name || 'Someone'} declined your invitation`,
      data: { invitationId: inv.id, projectId: inv.projectId },
    });

    return inv;
  }

  static completeProject(projectId: string, ownerId: string) {
    const result = this.update(projectId, ownerId, { status: 'completed' });
    if (!result || (result as any).error) return result;
    const project = result as AppProject;
    // seed collaboration edges between all members
    CollaborationService.recordProjectCompletion(project);
    return project;
  }
}
