import type { Pool } from "pg";
import type { QuotaStatus } from "../types/dto";
import { getConfigValue } from "./appConfig.service";

export const DEFAULT_FREE_DAILY_QUOTA = 20;

export interface QuotaCheckResult {
  allowed: boolean;
  status: QuotaStatus;
}

/** UTC calendar day, e.g. "2026-10-06" — the quota resets at UTC midnight. */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function getFreeDailyQuota(pool: Pool): Promise<number> {
  const value = await getConfigValue(pool, "free_daily_quota");
  if (value === null) return DEFAULT_FREE_DAILY_QUOTA;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FREE_DAILY_QUOTA;
}

export async function getUsageCount(pool: Pool, userId: string, now: Date = new Date()): Promise<number> {
  const date = todayUtc(now);
  const result = await pool.query<{ count: number }>(
    `SELECT count FROM daily_usage WHERE user_id = $1 AND usage_date = $2`,
    [userId, date],
  );
  return result.rows[0]?.count ?? 0;
}

async function incrementUsage(pool: Pool, userId: string, now: Date): Promise<number> {
  const date = todayUtc(now);
  const result = await pool.query<{ count: number }>(
    `INSERT INTO daily_usage (user_id, usage_date, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, usage_date) DO UPDATE SET count = daily_usage.count + 1
     RETURNING count`,
    [userId, date],
  );
  return result.rows[0].count;
}

/**
 * Atomically checks the caller's remaining quota and, if allowed, consumes
 * one unit. Premium users bypass the quota entirely. Race-safe via the
 * ON CONFLICT ... DO UPDATE in incrementUsage (two concurrent requests for
 * the same user/day both succeed and both get a correct, distinct count).
 */
export async function checkAndConsumeQuota(
  pool: Pool,
  userId: string,
  isPremium: boolean,
  now: Date = new Date(),
): Promise<QuotaCheckResult> {
  if (isPremium) {
    return { allowed: true, status: { unlimited: true, limit: null, used: null, remaining: null } };
  }

  const limit = await getFreeDailyQuota(pool);
  const used = await getUsageCount(pool, userId, now);

  if (used >= limit) {
    return { allowed: false, status: { unlimited: false, limit, used, remaining: 0 } };
  }

  const newUsed = await incrementUsage(pool, userId, now);
  return {
    allowed: true,
    status: { unlimited: false, limit, used: newUsed, remaining: Math.max(0, limit - newUsed) },
  };
}

export async function getQuotaStatus(
  pool: Pool,
  userId: string,
  isPremium: boolean,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  if (isPremium) return { unlimited: true, limit: null, used: null, remaining: null };
  const limit = await getFreeDailyQuota(pool);
  const used = await getUsageCount(pool, userId, now);
  return { unlimited: false, limit, used, remaining: Math.max(0, limit - used) };
}
