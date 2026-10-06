import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../../src/app";
import {
  createTestPool,
  resetDb,
  seedFixtureSponsors,
  buildTestContext,
  FakeGoogleTokenVerifier,
} from "./setup";

describe("backend API (integration, real Postgres)", () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    await seedFixtureSponsors(pool);
    const ctx = await buildTestContext(pool);
    app = createApp(ctx);
  });

  async function signIn(): Promise<string> {
    const res = await request(app).post("/api/auth/google").send({ googleAccessToken: "fake-token" });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  describe("POST /api/auth/google", () => {
    it("issues a session token and upserts the user on success", async () => {
      const res = await request(app).post("/api/auth/google").send({ googleAccessToken: "fake-token" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTypeOf("string");
      expect(res.body.user.email).toBe("fixture@example.com");
    });

    it("returns 401 when the Google verifier rejects the token", async () => {
      const ctx = await buildTestContext(pool, { googleVerifier: new FakeGoogleTokenVerifier({ kind: "failure" }) });
      const failingApp = createApp(ctx);
      const res = await request(failingApp).post("/api/auth/google").send({ googleAccessToken: "bad-token" });
      expect(res.status).toBe(401);
    });

    it("returns 400 when googleAccessToken is missing", async () => {
      const res = await request(app).post("/api/auth/google").send({});
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/me", () => {
    it("requires authentication", async () => {
      const res = await request(app).get("/api/me");
      expect(res.status).toBe(401);
    });

    it("returns the user profile and quota status", async () => {
      const token = await signIn();
      const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.isPremium).toBe(false);
      expect(res.body.quota).toEqual({ unlimited: false, limit: 20, used: 0, remaining: 20 });
    });
  });

  describe("POST /api/check", () => {
    it("matches a known sponsor and SOC code, and consumes one quota unit", async () => {
      const token = await signIn();
      const res = await request(app)
        .post("/api/check")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Google (UK) Limited", jobTitle: "Software Developer" });

      expect(res.status).toBe(200);
      expect(res.body.sponsor.confidence).toBe("Exact match");
      expect(res.body.sponsor.matchedLegalName).toBe("Google (UK) Limited");
      expect(res.body.soc.selected.code).toBe("2134");
      expect(res.body.salary.socCode).toBe("2134");
      expect(res.body.quota).toEqual({ unlimited: false, limit: 20, used: 1, remaining: 19 });
    });

    it("reports No match found for a company not in the register", async () => {
      const token = await signIn();
      const res = await request(app)
        .post("/api/check")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Totally Fake Megacorp Intl", jobTitle: "Bricklayer" });

      expect(res.status).toBe(200);
      expect(res.body.sponsor.confidence).toBe("No match found");
      expect(res.body.soc.selected.code).toBe("5313");
    });

    it("applies a manual SOC override and skips keyword matching", async () => {
      const token = await signIn();
      const res = await request(app)
        .post("/api/check")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyName: "Google (UK) Limited", jobTitle: "Whatever Title", socOverrideCode: "5313" });

      expect(res.status).toBe(200);
      expect(res.body.soc.confidence).toBe("manual-override");
      expect(res.body.soc.selected.code).toBe("5313");
    });

    it("returns 400 when companyName or jobTitle is missing", async () => {
      const token = await signIn();
      const res = await request(app).post("/api/check").set("Authorization", `Bearer ${token}`).send({ jobTitle: "x" });
      expect(res.status).toBe(400);
    });

    it("returns 429 once the daily quota is exhausted", async () => {
      await pool.query("UPDATE app_config SET value = '2' WHERE key = 'free_daily_quota'");
      const token = await signIn();
      const body = { companyName: "Google (UK) Limited", jobTitle: "Bricklayer" };

      const first = await request(app).post("/api/check").set("Authorization", `Bearer ${token}`).send(body);
      const second = await request(app).post("/api/check").set("Authorization", `Bearer ${token}`).send(body);
      const third = await request(app).post("/api/check").set("Authorization", `Bearer ${token}`).send(body);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.body.quota.remaining).toBe(0);
    });
  });

  describe("GET /api/soc/search", () => {
    it("returns matching SOC occupations for a query", async () => {
      const token = await signIn();
      const res = await request(app).get("/api/soc/search?q=software").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.results.some((r: { code: string }) => r.code === "2134")).toBe(true);
    });
  });

  describe("GET/PUT /api/admin/config/:key", () => {
    it("rejects requests without the admin key", async () => {
      const res = await request(app).get("/api/admin/config/free_daily_quota");
      expect(res.status).toBe(403);
    });

    it("reads and updates a config value with the correct admin key", async () => {
      const adminKey = process.env.ADMIN_API_KEY as string;
      const getRes = await request(app).get("/api/admin/config/free_daily_quota").set("X-Admin-Key", adminKey);
      expect(getRes.status).toBe(200);
      expect(getRes.body.value).toBe("20");

      const putRes = await request(app)
        .put("/api/admin/config/free_daily_quota")
        .set("X-Admin-Key", adminKey)
        .send({ value: "5" });
      expect(putRes.status).toBe(200);
      expect(putRes.body.value).toBe("5");

      const getAfter = await request(app).get("/api/admin/config/free_daily_quota").set("X-Admin-Key", adminKey);
      expect(getAfter.body.value).toBe("5");
    });
  });
});
