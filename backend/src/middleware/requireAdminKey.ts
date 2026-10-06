import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { HttpError } from "../lib/httpError";

export function requireAdminKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header("x-admin-key");
  if (!env.ADMIN_API_KEY || !provided || provided !== env.ADMIN_API_KEY) {
    next(new HttpError(403, "Invalid admin key"));
    return;
  }
  next();
}
