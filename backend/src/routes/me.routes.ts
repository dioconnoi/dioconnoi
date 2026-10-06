import { Router } from "express";
import type { AppContext } from "../appContext";
import { requireAuth } from "../middleware/requireAuth";
import { getUserById } from "../services/users.service";
import { getQuotaStatus } from "../services/quota.service";
import { HttpError } from "../lib/httpError";
import type { MeResponseBody } from "../types/dto";

export function createMeRouter(ctx: AppContext): Router {
  const router = Router();

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const user = await getUserById(ctx.pool, req.userId!);
      if (!user) throw new HttpError(404, "User not found");

      const quota = await getQuotaStatus(ctx.pool, user.id, user.isPremium);

      const body: MeResponseBody = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        isPremium: user.isPremium,
        quota,
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
