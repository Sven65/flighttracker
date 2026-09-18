import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth';
import type { Driver } from '../db/driver';

export default function accountRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);
  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

  router.get('/', async (req, res) => {
    const user = await db.getUserById(req.session.userId!);
    res.render('account', { user, emailError: null, passwordError: null, passwordSuccess: false });
  });

  router.post('/email', async (req, res) => {
    const email = (req.body.email || '').trim();
    const currentUser = await db.getUserById(req.session.userId!);

    try {
      const updated = await db.updateUserEmail(req.session.userId!, email || null);
      res.render('account', {
        user: updated,
        emailError: null,
        passwordError: null,
        passwordSuccess: false,
      });
    } catch {
      // UNIQUE constraint on users.email - the only realistic failure here.
      res.render('account', {
        user: currentUser,
        emailError: 'That email is already in use by another account.',
        passwordError: null,
        passwordSuccess: false,
      });
    }
  });

  router.post('/password', async (req, res) => {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;
    const user = await db.getUserById(req.session.userId!);
    if (!user) {
      res.status(404).send('Not found');
      return;
    }

    const currentOk = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!currentOk) {
      res.render('account', {
        user,
        emailError: null,
        passwordError: 'Current password is incorrect.',
        passwordSuccess: false,
      });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      res.render('account', {
        user,
        emailError: null,
        passwordError: 'New password must be at least 8 characters.',
        passwordSuccess: false,
      });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      res.render('account', {
        user,
        emailError: null,
        passwordError: 'New passwords do not match.',
        passwordSuccess: false,
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.updateUserPassword(req.session.userId!, passwordHash);
    res.render('account', { user, emailError: null, passwordError: null, passwordSuccess: true });
  });

  return router;
}
