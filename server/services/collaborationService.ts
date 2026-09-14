/**
 * Collaboration graph foundation (spec §22–23).
 * Stores pairwise edges; no ML yet — just data model for future ranking.
 */
import { getDatabase, saveDatabase } from '../db';
import type { AppProject } from './projectService';

export interface CollaborationEdge {
  id: string;
  userA: string;
  userB: string;
  projectId: string;
  successfulProjectsTogether: number;
  collaborationScore: number; // 0–1
  averageFeedback?: number;
  lastProjectAt?: string;
  createdAt: string;
  updatedAt?: string;
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

function ensure(db: any) {
  if (!Array.isArray(db.collaborations)) db.collaborations = [];
}

export class CollaborationService {
  static recordProjectCompletion(project: AppProject) {
    const members = [...new Set(project.memberIds || [])];
    if (members.length < 2) return [];

    const db = getDatabase() as any;
    ensure(db);
    const edges: CollaborationEdge[] = db.collaborations;
    const touched: CollaborationEdge[] = [];

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        const key = pairKey(a, b);
        let edge = edges.find(
          (e) => pairKey(e.userA, e.userB) === key
        );
        if (!edge) {
          edge = {
            id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userA: a < b ? a : b,
            userB: a < b ? b : a,
            projectId: project.id,
            successfulProjectsTogether: 1,
            collaborationScore: 0.6,
            lastProjectAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          };
          edges.push(edge);
        } else {
          edge.successfulProjectsTogether += 1;
          // score climbs with diminishing returns
          edge.collaborationScore = Math.min(
            0.99,
            0.5 + (1 - Math.exp(-edge.successfulProjectsTogether / 5)) * 0.5
          );
          edge.lastProjectAt = new Date().toISOString();
          edge.updatedAt = new Date().toISOString();
          edge.projectId = project.id;
        }
        touched.push(edge);
      }
    }
    db.collaborations = edges;
    saveDatabase(db);
    return touched;
  }

  static getScore(userA: string, userB: string): number {
    const db = getDatabase() as any;
    ensure(db);
    const key = pairKey(userA, userB);
    const edge = (db.collaborations as CollaborationEdge[]).find(
      (e) => pairKey(e.userA, e.userB) === key
    );
    return edge?.collaborationScore ?? 0.5; // neutral default
  }

  static listForUser(userId: string) {
    const db = getDatabase() as any;
    ensure(db);
    return (db.collaborations as CollaborationEdge[]).filter(
      (e) => e.userA === userId || e.userB === userId
    );
  }

  static addFeedback(userA: string, userB: string, rating: number) {
    const db = getDatabase() as any;
    ensure(db);
    const key = pairKey(userA, userB);
    let edge = (db.collaborations as CollaborationEdge[]).find(
      (e) => pairKey(e.userA, e.userB) === key
    );
    if (!edge) {
      edge = {
        id: `col_${Date.now()}`,
        userA: userA < userB ? userA : userB,
        userB: userA < userB ? userB : userA,
        projectId: '',
        successfulProjectsTogether: 0,
        collaborationScore: Math.min(1, Math.max(0, rating)),
        averageFeedback: rating,
        createdAt: new Date().toISOString(),
      };
      db.collaborations.push(edge);
    } else {
      const prev = edge.averageFeedback ?? edge.collaborationScore;
      edge.averageFeedback = (prev + rating) / 2;
      edge.collaborationScore = Math.min(
        0.99,
        (edge.collaborationScore + edge.averageFeedback) / 2
      );
      edge.updatedAt = new Date().toISOString();
    }
    saveDatabase(db);
    return edge;
  }
}
