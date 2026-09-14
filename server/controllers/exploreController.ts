import type { Request, Response } from 'express';
import { ExploreService } from '../services/exploreService';
import type { ExploreItemType } from '../types';

export class ExploreController {
  /**
   * GET /api/explore
   */
  public static async getFeed(req: Request, res: Response): Promise<void> {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : 'all';
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const feed = ExploreService.getExploreFeed({ userId, category, search });
      res.json(feed);
    } catch (err) {
      console.error('[ExploreController.getFeed] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve Explore feed.' });
    }
  }

  /**
   * GET /api/explore/:type/:id
   */
  public static async getItemDetail(req: Request, res: Response): Promise<void> {
    try {
      const type = req.params.type as ExploreItemType;
      const id = req.params.id;

      if (!type || !id) {
        res.status(400).json({ success: false, error: 'Type and id parameters are required.' });
        return;
      }

      const validTypes: ExploreItemType[] = ['work', 'project', 'task', 'club', 'creator'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ success: false, error: `Invalid item type: ${type}` });
        return;
      }

      const item = ExploreService.getItemDetail(type, id);
      if (!item) {
        res.status(404).json({ success: false, error: `${type} not found with id ${id}` });
        return;
      }

      res.json({ success: true, itemType: type, item });
    } catch (err) {
      console.error('[ExploreController.getItemDetail] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve item detail.' });
    }
  }

  /**
   * GET /api/explore/:type/:id/related
   * Enables Work -> People and Content -> Content interconnected discovery
   */
  public static async getRelated(req: Request, res: Response): Promise<void> {
    try {
      const type = req.params.type as ExploreItemType;
      const id = req.params.id;

      if (!type || !id) {
        res.status(400).json({ success: false, error: 'Type and id parameters are required.' });
        return;
      }

      const validTypes: ExploreItemType[] = ['work', 'project', 'task', 'club', 'creator'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ success: false, error: `Invalid item type: ${type}` });
        return;
      }

      const related = ExploreService.getRelatedContent(type, id);
      res.json(related);
    } catch (err) {
      console.error('[ExploreController.getRelated] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve related content.' });
    }
  }

  /**
   * GET /api/explore/creator/:id/public-work
   */
  public static async getCreatorPublicWork(req: Request, res: Response): Promise<void> {
    try {
      const creatorId = req.params.id;
      if (!creatorId) {
        res.status(400).json({ success: false, error: 'Creator ID is required.' });
        return;
      }
      const data = ExploreService.getCreatorPublicWork(creatorId);
      if (!data) {
        res.status(404).json({ success: false, error: 'Creator not found.' });
        return;
      }
      res.json({ success: true, ...data });
    } catch (err) {
      console.error('[ExploreController.getCreatorPublicWork] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve creator public work.' });
    }
  }

  /**
   * POST /api/explore/apply
   */
  public static async applyToProjectOrTask(req: Request, res: Response): Promise<void> {
    try {
      const { senderId, recipientId, projectId, taskId, message } = req.body;
      if (!recipientId) {
        res.status(400).json({ success: false, error: 'Recipient ID is required.' });
        return;
      }
      const result = ExploreService.applyToProjectOrTask({
        senderId,
        recipientId,
        projectId,
        taskId,
        message,
      });
      res.json(result);
    } catch (err) {
      console.error('[ExploreController.applyToProjectOrTask] Error:', err);
      res.status(500).json({ success: false, error: 'Failed to submit application.' });
    }
  }
}
