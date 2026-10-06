import { Router } from "express";
import type { AppContext } from "../appContext";
import { requireAuth } from "../middleware/requireAuth";
import { getUserById } from "../services/users.service";
import { checkAndConsumeQuota } from "../services/quota.service";
import { matchSoc, applyManualOverride } from "../services/socMatch.service";
import { computeSalaryThresholds, DATA_VERSIONS } from "../services/salary.service";
import { HttpError } from "../lib/httpError";
import type { CheckRequestBody, CheckResponseBody } from "../types/dto";

const DISCLAIMER =
  "Informational only, not legal advice. Sponsor status, SOC code and salary thresholds are " +
  "matched automatically against gov.uk data snapshots and may be out of date or imprecise — " +
  "always verify on gov.uk before relying on this for a real visa application.";

export function createCheckRouter(ctx: AppContext): Router {
  const router = Router();

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const user = await getUserById(ctx.pool, req.userId!);
      if (!user) throw new HttpError(404, "User not found");

      const quota = await checkAndConsumeQuota(ctx.pool, user.id, user.isPremium);
      if (!quota.allowed) {
        res.status(429).json({ error: "Daily free search quota exceeded", quota: quota.status });
        return;
      }

      const body = req.body as CheckRequestBody;
      const companyName = (body?.companyName ?? "").trim();
      const jobTitle = (body?.jobTitle ?? "").trim();
      if (!companyName || !jobTitle) {
        throw new HttpError(400, "companyName and jobTitle are required");
      }

      const sponsor = ctx.sponsorIndexHolder.current.match(companyName);

      const soc = body.socOverrideCode
        ? applyManualOverride(ctx.socOccupations, body.socOverrideCode)
        : matchSoc(ctx.socOccupations, jobTitle, body.jobDescription);

      const salary = computeSalaryThresholds(soc.selected?.code ?? null);

      const responseBody: CheckResponseBody = {
        sponsor,
        soc,
        salary,
        quota: quota.status,
        disclaimer: DISCLAIMER,
        dataVersions: {
          sponsors: ctx.sponsorIndexHolder.snapshotDate,
          ...DATA_VERSIONS,
        },
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createSocSearchRouter(ctx: AppContext): Router {
  const router = Router();

  router.get("/search", requireAuth, (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    const results = ctx.socOccupations
      .filter(
        (o) =>
          o.code.includes(q) ||
          o.jobType.toLowerCase().includes(q) ||
          o.relatedJobTitles.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, 20)
      .map((o) => ({ code: o.code, jobType: o.jobType, eligibility: o.eligibility }));
    res.json({ results });
  });

  return router;
}
