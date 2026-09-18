import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth';
import { generateInviteCode } from '../utils/inviteCode';
import type { Driver } from '../db/driver';
import type { User } from '../types/models';

interface AccountViewOptions {
  user: User | null;
  emailError?: string | null;
  passwordError?: string | null;
  passwordSuccess?: boolean;
  inviteError?: string | null;
  newInviteCode?: string | null;
}

export default function accountRoutes(db: Driver): Router {
  const router = express.Router();
  router.use(requireAuth);
  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

  async function renderAccount(req: Request, res: Response, opts: AccountViewOptions) {
    const invites = await db.listInviteCodesCreatedBy(req.session.userId!);
    res.render('account', {
      user: opts.user,
      invites,
      emailError: opts.emailError ?? null,
      passwordError: opts.passwordError ?? null,
      passwordSuccess: opts.passwordSuccess ?? false,
      inviteError: opts.inviteError ?? null,
      newInviteCode: opts.newInviteCode ?? null,
    });
  }

  router.get('/', async (req, res) => {
    const user = await db.getUserById(req.session.userId!);
    await renderAccount(req, res, { user });
  });

  router.post('/email', async (req, res) => {
    const email = (req.body.email || '').trim();
    const currentUser = await db.getUserById(req.session.userId!);

    try {
      const updated = await db.updateUserEmail(req.session.userId!, email || null);
      await renderAccount(req, res, { user: updated });
    } catch {
      // UNIQUE constraint on users.email - the only realistic failure here.
      await renderAccount(req, res, {
        user: currentUser,
        emailError: 'That email is already in use by another account.',
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
      await renderAccount(req, res, { user, passwordError: 'Current password is incorrect.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      await renderAccount(req, res, {
        user,
        passwordError: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      await renderAccount(req, res, { user, passwordError: 'New passwords do not match.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.updateUserPassword(req.session.userId!, passwordHash);
    await renderAccount(req, res, { user, passwordSuccess: true });
  });

  router.post('/invites', async (req, res) => {
    const user = await db.getUserById(req.session.userId!);
    if (!user) {
      res.status(404).send('Not found');
      return;
    }

    if (user.is_admin !== 1 && user.invites_remaining <= 0) {
      await renderAccount(req, res, { user, inviteError: 'No invites remaining.' });
      return;
    }

    // PRIMARY KEY, so retry on the (astronomically unlikely) collision.
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      try {
        await db.createInviteCode(user.id, candidate);
        code = candidate;
        break;
      } catch {
        continue;
      }
    }
    if (!code) {
      await renderAccount(req, res, { user, inviteError: 'Could not generate a code - try again.' });
      return;
    }

    if (user.is_admin !== 1) {
      await db.decrementInvites(user.id);
    }

    const updatedUser = await db.getUserById(user.id);
    await renderAccount(req, res, { user: updatedUser, newInviteCode: code });
  });

  return router;
}
