import { Router } from "express";
import type { AppContext } from "../appContext";
import { upsertUserFromGoogle } from "../services/users.service";
import { signSessionToken } from "../services/jwt.service";
import { HttpError } from "../lib/httpError";

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();

  router.post("/google", async (req, res, next) => {
    try {
      const googleAccessToken = req.body?.googleAccessToken;
      if (typeof googleAccessToken !== "string" || googleAccessToken.length === 0) {
        throw new HttpError(400, "Missing googleAccessToken");
      }

      const info = await ctx.googleVerifier.verify(googleAccessToken);
      const user = await upsertUserFromGoogle(ctx.pool, info);
      const token = signSessionToken(user.id);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (err) {
      if (err instanceof HttpError) {
        next(err);
      } else {
        next(new HttpError(401, "Google token verification failed"));
      }
    }
  });

  return router;
}
