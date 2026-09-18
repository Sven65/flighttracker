import express, { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import type { Driver } from '../db/driver';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser || req.currentUser.is_admin !== 1) {
    res.status(403).send('Admins only.');
    return;
  }
  next();
}

export default function adminRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);
  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    const users = await db.listAllUsersForAdmin();
    res.render('admin', { users, error: null });
  });

  router.post('/grant-invites', async (req, res) => {
    const targetUserId = parseInt(req.body.userId, 10);
    const amount = parseInt(req.body.amount, 10);

    if (!targetUserId || !amount || amount <= 0) {
      const users = await db.listAllUsersForAdmin();
      res.render('admin', { users, error: 'Enter a valid user and amount.' });
      return;
    }

    await db.grantInvites(targetUserId, amount);
    res.redirect('/admin');
  });

  return router;
}
