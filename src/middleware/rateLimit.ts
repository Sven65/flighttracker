import { rateLimit } from 'express-rate-limit';

/**
 * Keyed by IP (express-rate-limit's default), so this only works
 * correctly behind a reverse proxy if TRUST_PROXY is set - see
 * server.ts and .env.example. Without it, every request looks like it
 * comes from the proxy's own IP and everyone shares one bucket.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Wait a few minutes and try again.',
});

/** Slightly stricter than login - also the only real brake on brute-forcing the invite code. */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts. Wait a few minutes and try again.',
});
