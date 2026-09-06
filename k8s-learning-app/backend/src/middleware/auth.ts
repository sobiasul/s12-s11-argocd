import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessClaims } from "../services/tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AccessClaims }
  }
}

export const ACCESS_COOKIE = "k8s_access";
export const REFRESH_COOKIE = "k8s_refresh";

/**
 * Reads the access token from an httpOnly cookie, falling back to an
 * Authorization: Bearer header so the API stays usable from curl and kubectl
 * port-forward while you are learning.
 */
function extract(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extract(req);
  if (!token) return res.status(401).json({ error: "authentication required" });
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

/** Attaches the user when present, but never rejects. For endpoints that are
 *  public but richer when signed in. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extract(req);
  if (token) {
    try { req.user = verifyAccessToken(token); } catch { /* ignore */ }
  }
  next();
}
