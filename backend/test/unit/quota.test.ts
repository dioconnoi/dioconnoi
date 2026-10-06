import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { todayUtc, checkAndConsumeQuota, getQuotaStatus, DEFAULT_FREE_DAILY_QUOTA } from "../../src/services/quota.service";

describe("todayUtc", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(todayUtc(new Date("2026-10-06T23:59:00Z"))).toBe("2026-10-06");
    expect(todayUtc(new Date("2026-10-06T00:00:00Z"))).toBe("2026-10-06");
  });
});

class FakePool {
  appConfig = new Map<string, string>();
  dailyUsage = new Map<string, number>();

  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    if (sql.includes("FROM app_config")) {
      const value = this.appConfig.get(params[0] as string);
      return { rows: value !== undefined ? [{ value }] : [] };
    }
    if (sql.startsWith("SELECT count FROM daily_usage")) {
      const [userId, date] = params as [string, string];
      const count = this.dailyUsage.get(`${userId}|${date}`);
      return { rows: count !== undefined ? [{ count }] : [] };
    }
    if (sql.includes("INSERT INTO daily_usage")) {
      const [userId, date] = params as [string, string];
      const key = `${userId}|${date}`;
      const newCount = (this.dailyUsage.get(key) ?? 0) + 1;
      this.dailyUsage.set(key, newCount);
      return { rows: [{ count: newCount }] };
    }
    throw new Error(`Unhandled query in FakePool: ${sql}`);
  }
}

describe("checkAndConsumeQuota", () => {
  it("bypasses the quota entirely for premium users", async () => {
    const pool = new FakePool() as unknown as Pool;
    const result = await checkAndConsumeQuota(pool, "user-1", true);
    expect(result.allowed).toBe(true);
    expect(result.status.unlimited).toBe(true);
  });

  it("uses the default quota when app_config has no row", async () => {
    const pool = new FakePool() as unknown as Pool;
    const result = await checkAndConsumeQuota(pool, "user-1", false);
    expect(result.allowed).toBe(true);
    expect(result.status.limit).toBe(DEFAULT_FREE_DAILY_QUOTA);
    expect(result.status.used).toBe(1);
  });

  it("denies once the daily limit is reached", async () => {
    const pool = new FakePool();
    pool.appConfig.set("free_daily_quota", "2");
    const typedPool = pool as unknown as Pool;
    const now = new Date("2026-10-06T12:00:00Z");

    const first = await checkAndConsumeQuota(typedPool, "user-1", false, now);
    const second = await checkAndConsumeQuota(typedPool, "user-1", false, now);
    const third = await checkAndConsumeQuota(typedPool, "user-1", false, now);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.status.remaining).toBe(0);
  });

  it("resets the count on a new UTC day", async () => {
    const pool = new FakePool();
    pool.appConfig.set("free_daily_quota", "1");
    const typedPool = pool as unknown as Pool;

    const day1 = new Date("2026-10-06T23:00:00Z");
    const day2 = new Date("2026-10-07T00:30:00Z");

    const resultDay1 = await checkAndConsumeQuota(typedPool, "user-1", false, day1);
    const resultDay1Again = await checkAndConsumeQuota(typedPool, "user-1", false, day1);
    const resultDay2 = await checkAndConsumeQuota(typedPool, "user-1", false, day2);

    expect(resultDay1.allowed).toBe(true);
    expect(resultDay1Again.allowed).toBe(false);
    expect(resultDay2.allowed).toBe(true); // fresh day, fresh quota
  });

  it("keeps per-user counts independent", async () => {
    const pool = new FakePool();
    pool.appConfig.set("free_daily_quota", "1");
    const typedPool = pool as unknown as Pool;
    const now = new Date("2026-10-06T12:00:00Z");

    const userA = await checkAndConsumeQuota(typedPool, "user-a", false, now);
    const userB = await checkAndConsumeQuota(typedPool, "user-b", false, now);

    expect(userA.allowed).toBe(true);
    expect(userB.allowed).toBe(true);
  });
});

describe("getQuotaStatus", () => {
  it("reports status without consuming a unit", async () => {
    const pool = new FakePool();
    pool.appConfig.set("free_daily_quota", "5");
    const typedPool = pool as unknown as Pool;
    const now = new Date("2026-10-06T12:00:00Z");

    const before = await getQuotaStatus(typedPool, "user-1", false, now);
    expect(before.used).toBe(0);
    expect(before.remaining).toBe(5);

    await checkAndConsumeQuota(typedPool, "user-1", false, now);
    const after = await getQuotaStatus(typedPool, "user-1", false, now);
    expect(after.used).toBe(1);
    expect(after.remaining).toBe(4);
  });
});
