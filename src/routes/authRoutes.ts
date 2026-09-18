import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { redirectIfAuthed } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';
import type { Driver } from '../db/driver';

export default function authRoutes(db: Driver): Router {
  const router = express.Router();
  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const requireInvite = process.env.REQUIRE_INVITE !== 'false';

  router.get('/register', redirectIfAuthed, async (req, res) => {
    const userCount = await db.countUsers();
    res.render('register', { error: null, username: '', inviteRequired: requireInvite && userCount > 0 });
  });

  router.post('/register', redirectIfAuthed, registerLimiter, async (req, res) => {
    const username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';
    const passwordConfirm = req.body.passwordConfirm || '';
    const submittedCode = (req.body.inviteCode || '').trim().toUpperCase();

    const userCount = await db.countUsers();
    const inviteRequired = requireInvite && userCount > 0;

    // First-ever account bootstraps as admin with no code needed.
    let invite = null;
    if (inviteRequired) {
      if (!submittedCode) {
        res.render('register', { error: 'An invite code is required.', username, inviteRequired });
        return;
      }
      invite = await db.getInviteCode(submittedCode);
      if (!invite || invite.used_by) {
        res.render('register', {
          error: 'That invite code is invalid or already used.',
          username,
          inviteRequired,
        });
        return;
      }
    }

    if (!username || !password) {
      res.render('register', {
        error: 'Username and password are required.',
        username,
        inviteRequired,
      });
      return;
    }
    if (password !== passwordConfirm) {
      res.render('register', { error: 'Passwords do not match.', username, inviteRequired });
      return;
    }
    if (password.length < 8) {
      res.render('register', {
        error: 'Password must be at least 8 characters.',
        username,
        inviteRequired,
      });
      return;
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      res.render('register', { error: 'That username is already taken.', username, inviteRequired });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await db.createUser({
      username,
      email: email || null,
      passwordHash,
      isAdmin: userCount === 0,
    });

    if (invite) {
      await db.markInviteCodeUsed(invite.code, user.id);
    }

    req.session.userId = user.id;
    res.redirect('/');
  });

  router.get('/login', redirectIfAuthed, (req, res) => {
    res.render('login', { error: null, username: '' });
  });

  router.post('/login', redirectIfAuthed, loginLimiter, async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    const user = await db.getUserByUsername(username);
    // Constant-time either way, so "no such user" and "wrong password" look identical.
    const hashToCheck = user ? user.password_hash : '$2a$12$invalidsaltinvalidsaltinvalidsal';
    const ok = await bcrypt.compare(password, hashToCheck);

    if (!user || !ok) {
      res.render('login', { error: 'Invalid username or password.', username });
      return;
    }

    req.session.userId = user.id;
    res.redirect('/');
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  return router;
}
