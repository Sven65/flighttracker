import { rateLimit } from 'express-rate-limit';

/** Keyed by IP - needs TRUST_PROXY set behind a reverse proxy or everyone shares one bucket. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Wait a few minutes and try again.',
});

export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts. Wait a few minutes and try again.',
});
