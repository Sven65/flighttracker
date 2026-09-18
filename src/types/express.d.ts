import type { User } from './models';

// Add our custom fields onto express-session's SessionData
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

// Add the currentUser field the attachUser middleware sets on each request
declare global {
  namespace Express {
    interface Request {
      currentUser?: User | null;
    }
  }
}

export {};
