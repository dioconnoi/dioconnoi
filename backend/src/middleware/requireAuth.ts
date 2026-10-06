import type { NextFunction, Request, Response } from "express";
import { verifySessionToken } from "../services/jwt.service";
import { HttpError } from "../lib/httpError";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    next(new HttpError(401, "Missing or malformed Authorization header"));
    return;
  }
  try {
    const payload = verifySessionToken(match[1]);
    req.userId = payload.userId;
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired session token"));
  }
}
