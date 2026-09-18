import type { Request, Response, NextFunction } from 'express';
import type { Driver } from '../db/driver';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    res.redirect('/login');
    return;
  }
  next();
}

export function redirectIfAuthed(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    res.redirect('/');
    return;
  }
  next();
}

// Makes the current user available to every view as `currentUser`
export function attachUser(db: Driver) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.session && req.session.userId) {
      req.currentUser = await db.getUserById(req.session.userId);
    }
    res.locals.currentUser = req.currentUser || null;
    next();
  };
}
