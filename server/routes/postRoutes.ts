import { Router } from 'express';
import { getDatabase, saveDatabase } from '../db';

export const postRoutes = Router();

// 1. POST /api/posts: Create a post
postRoutes.post('/posts', async (req, res) => {
  try {
    const db = getDatabase();
    const { id, authorId, authorName, authorRole, authorAvatar, caption, imageUrl } = req.body;

    const postId = id || `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const postData = {
      id: postId,
      authorId,
      authorName,
      authorRole,
      authorAvatar: authorAvatar || null,
      caption,
      imageUrl: imageUrl || null,
      likes: [],
      createdAt: new Date().toISOString(),
    };

    if (!db.posts) {
      db.posts = [];
    }
    db.posts.push(postData);
    saveDatabase(db);

    return res.status(201).json(postData);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/posts: Return a global feed of posts, ordered by createdAt descending, limit 50
postRoutes.get('/posts', async (req, res) => {
  try {
    const db = getDatabase();
    const posts = (db.posts || [])
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
      
    return res.json({ posts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/posts/user/:userId: Return posts for a specific user, ordered by createdAt descending
postRoutes.get('/posts/user/:userId', async (req, res) => {
  try {
    const db = getDatabase();
    const { userId } = req.params;
    
    const posts = (db.posts || [])
      .filter((p: any) => p.authorId === userId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
    return res.json({ posts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. POST /api/posts/:postId/like: Toggle like for a post
postRoutes.post('/posts/:postId/like', async (req, res) => {
  try {
    const db = getDatabase();
    const { postId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!db.posts) db.posts = [];
    const postIndex = db.posts.findIndex((p: any) => p.id === postId);
    
    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = db.posts[postIndex];
    const likes = post.likes || [];
    
    let newLikes;
    if (likes.includes(userId)) {
      newLikes = likes.filter((id: string) => id !== userId);
    } else {
      newLikes = [...likes, userId];
    }
    
    post.likes = newLikes;
    saveDatabase(db);

    return res.json({ success: true, likes: newLikes });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 5. DELETE /api/posts/:postId: Delete a post
postRoutes.delete('/posts/:postId', async (req, res) => {
  try {
    const db = getDatabase();
    const { postId } = req.params;

    if (!db.posts) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postIndex = db.posts.findIndex((p: any) => p.id === postId);
    if (postIndex === -1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    db.posts.splice(postIndex, 1);
    saveDatabase(db);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});
