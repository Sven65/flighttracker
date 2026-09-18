import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth';
import { generateInviteCode } from '../utils/inviteCode';
import type { Driver } from '../db/driver';

interface AccountFlash {
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

  function flashAndRedirect(req: Request, res: Response, flash: AccountFlash) {
    req.session.flash = flash as Record<string, unknown>;
    res.redirect('/account');
  }

  router.get('/', async (req, res) => {
    const user = await db.getUserById(req.session.userId!);
    const invites = await db.listInviteCodesCreatedBy(req.session.userId!);
    const flash = (req.session.flash ?? {}) as AccountFlash;
    delete req.session.flash;
    res.render('account', {
      user,
      invites,
      emailError: flash.emailError ?? null,
      passwordError: flash.passwordError ?? null,
      passwordSuccess: flash.passwordSuccess ?? false,
      inviteError: flash.inviteError ?? null,
      newInviteCode: flash.newInviteCode ?? null,
    });
  });

  router.post('/email', async (req, res) => {
    const email = (req.body.email || '').trim();
    try {
      await db.updateUserEmail(req.session.userId!, email || null);
      flashAndRedirect(req, res, {});
    } catch {
      // UNIQUE constraint on users.email - the only realistic failure here.
      flashAndRedirect(req, res, { emailError: 'That email is already in use by another account.' });
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
      flashAndRedirect(req, res, { passwordError: 'Current password is incorrect.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      flashAndRedirect(req, res, { passwordError: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      flashAndRedirect(req, res, { passwordError: 'New passwords do not match.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.updateUserPassword(req.session.userId!, passwordHash);
    flashAndRedirect(req, res, { passwordSuccess: true });
  });

  router.post('/invites', async (req, res) => {
    const user = await db.getUserById(req.session.userId!);
    if (!user) {
      res.status(404).send('Not found');
      return;
    }

    if (user.is_admin !== 1 && user.invites_remaining <= 0) {
      flashAndRedirect(req, res, { inviteError: 'No invites remaining.' });
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
      flashAndRedirect(req, res, { inviteError: 'Could not generate a code - try again.' });
      return;
    }

    if (user.is_admin !== 1) {
      await db.decrementInvites(user.id);
    }

    flashAndRedirect(req, res, { newInviteCode: code });
  });

  router.post('/theme', async (req, res) => {
    const theme = req.body.theme;
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') {
      res.status(400).send('Invalid theme.');
      return;
    }
    await db.updateUserTheme(req.session.userId!, theme);
    res.redirect('/account');
  });

  return router;
}
