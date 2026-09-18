import type { Request } from 'express';

export function setFlash(req: Request, data: Record<string, unknown>): void {
  req.session.flash = data;
}

export function popFlash<T>(req: Request): T {
  const flash = (req.session.flash ?? {}) as T;
  delete req.session.flash;
  return flash;
}
