import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { safeCompare } from '../utils/safeCompare';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Synchronizer-token CSRF (hand-rolled - `csurf` is deprecated).
 * ensureCsrfToken puts a per-session token in res.locals for forms to
 * render; verifyCsrfToken rejects state-changing requests without a
 * matching one. Both need to run after session + body-parser.
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
