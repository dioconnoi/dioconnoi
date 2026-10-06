import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface SessionTokenPayload {
  userId: string;
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ userId } satisfies SessionTokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY,
  } as jwt.SignOptions);
}

export function verifySessionToken(token: string): SessionTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || !decoded || typeof decoded.userId !== "string") {
    throw new Error("Invalid session token payload");
  }
  return { userId: decoded.userId };
}
