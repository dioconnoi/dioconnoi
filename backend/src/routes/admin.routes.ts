import { Router } from "express";
import type { AppContext } from "../appContext";
import { requireAdminKey } from "../middleware/requireAdminKey";
import { getConfigValue, setConfigValue } from "../services/appConfig.service";
import { HttpError } from "../lib/httpError";

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAdminKey);

  router.get("/config/:key", async (req, res, next) => {
    try {
      const value = await getConfigValue(ctx.pool, req.params.key);
      if (value === null) throw new HttpError(404, `No config value for key '${req.params.key}'`);
      res.json({ key: req.params.key, value });
    } catch (err) {
      next(err);
    }
  });

  router.put("/config/:key", async (req, res, next) => {
    try {
      const value = req.body?.value;
      if (typeof value !== "string" || value.length === 0) {
        throw new HttpError(400, "Body must be { value: string }");
      }
      await setConfigValue(ctx.pool, req.params.key, value, "admin-api");
      res.json({ key: req.params.key, value });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
