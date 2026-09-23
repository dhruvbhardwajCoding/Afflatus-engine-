import { Router } from 'express';
import { getAdminDb, resolveUserIdAsync } from '../services/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const postRoutes = Router();

// 1. POST /api/posts: Create a post
postRoutes.post('/posts', async (req, res) => {
  try {
    const db = getAdminDb();
    const { authorId, authorName, authorRole, authorAvatar, caption, imageUrl } = req.body;

    if (!authorId || (!caption && !imageUrl)) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const postDoc = {
      authorId,
      authorName,
      authorRole: authorRole || 'Creator',
      authorAvatar: authorAvatar || null,
      caption: caption || '',
      imageUrl: imageUrl || null,
      likes: [],
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection('posts').add(postDoc);
    
    return res.status(201).json({ success: true, post: { id: docRef.id, ...postDoc } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 2. GET /api/posts: Get global feed (all posts)
postRoutes.get('/posts', async (req, res) => {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
      
    const posts = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return res.json({ posts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 3. GET /api/posts/user/:userId: Get posts for a specific user
postRoutes.get('/posts/user/:userId', async (req, res) => {
  try {
    const db = getAdminDb();
    const { userId } = req.params;
    
    const snapshot = await db.collection('posts')
      .where('authorId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
      
    const posts = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return res.json({ posts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 4. POST /api/posts/:postId/like: Toggle like
postRoutes.post('/posts/:postId/like', async (req, res) => {
  try {
    const db = getAdminDb();
    const { postId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User ID is required' });
    }

    const postRef = db.collection('posts').doc(postId);
    
    await db.runTransaction(async (t: any) => {
      const doc = await t.get(postRef);
      if (!doc.exists) {
        throw new Error('Post not found');
      }
      const data = doc.data();
      const likes = data.likes || [];
      if (likes.includes(userId)) {
        t.update(postRef, { likes: FieldValue.arrayRemove(userId) });
      } else {
        t.update(postRef, { likes: FieldValue.arrayUnion(userId) });
      }
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 5. DELETE /api/posts/:postId: Delete a post
postRoutes.delete('/posts/:postId', async (req, res) => {
  try {
    const db = getAdminDb();
    const { postId } = req.params;

    await db.collection('posts').doc(postId).delete();
    
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});
