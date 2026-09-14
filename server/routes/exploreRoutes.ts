import { Router } from 'express';
import { ExploreController } from '../controllers/exploreController';

export const exploreRoutes = Router();

// GET /api/explore - Primary feed with filtering & scoring
exploreRoutes.get('/', ExploreController.getFeed);

// GET /api/explore/creator/:id/public-work - Creator's public work showcases and projects
exploreRoutes.get('/creator/:id/public-work', ExploreController.getCreatorPublicWork);

// POST /api/explore/apply - Apply/Connect to a project or task with database persistence
exploreRoutes.post('/apply', ExploreController.applyToProjectOrTask);

// GET /api/explore/:type/:id - Single item detail
exploreRoutes.get('/:type/:id', ExploreController.getItemDetail);

// GET /api/explore/:type/:id/related - Work -> People & content relation discovery
exploreRoutes.get('/:type/:id/related', ExploreController.getRelated);
