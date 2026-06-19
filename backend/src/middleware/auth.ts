import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthUser } from "../services/auth.js";

export type AuthedRequest = Request & { user?: AuthUser };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ detail: "Please sign in to continue." });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ detail: "Session expired. Please sign in again." });
    return;
  }
  req.user = user;
  next();
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const user = verifyToken(token);
    if (user) req.user = user;
  }
  next();
}
