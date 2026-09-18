import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { redirectIfAuthed } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';
import { safeCompare } from '../utils/safeCompare';
import type { Driver } from '../db/driver';

export default function authRoutes(db: Driver): Router {
  const router = express.Router();
  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const inviteCode = process.env.INVITE_CODE || '';
  const inviteRequired = inviteCode.length > 0;

  router.get('/register', redirectIfAuthed, (req, res) => {
    res.render('register', { error: null, username: '', inviteRequired });
  });

  router.post('/register', redirectIfAuthed, registerLimiter, async (req, res) => {
    const username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';
    const passwordConfirm = req.body.passwordConfirm || '';
    const submittedInvite = req.body.inviteCode || '';

    if (inviteRequired && !safeCompare(submittedInvite, inviteCode)) {
      res.render('register', { error: 'Invalid invite code.', username, inviteRequired });
      return;
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
    const user = await db.createUser({ username, email: email || null, passwordHash });

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
    // Always run bcrypt.compare (even with a dummy hash) so responses for
    // "no such user" and "wrong password" take the same amount of time.
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
