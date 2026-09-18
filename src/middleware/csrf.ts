import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { safeCompare } from '../utils/safeCompare';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Synchronizer-token CSRF protection - hand-rolled rather than pulling in
 * `csurf` (deprecated, no longer maintained). The pattern is standard and
 * small enough to read in full:
 *   1. ensureCsrfToken puts a random per-session token in res.locals so
 *      every view can render it into a hidden form field.
 *   2. verifyCsrfToken rejects any state-changing request whose _csrf
 *      field doesn't match what's in the session.
 * Both must run after the session and body-parser middleware.
 */
export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const submitted = req.body?._csrf;
  const expected = req.session.csrfToken;

  if (typeof submitted !== 'string' || !expected || !safeCompare(submitted, expected)) {
    res.status(403).send('Your session token expired or is invalid - go back and try again.');
    return;
  }

  next();
}
