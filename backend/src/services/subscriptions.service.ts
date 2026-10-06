import type { Pool } from "pg";

export interface SubscriptionRecord {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
}

export async function getSubscriptionByUserId(pool: Pool, userId: string): Promise<SubscriptionRecord | null> {
  const result = await pool.query<SubscriptionRecord>(
    `SELECT user_id AS "userId", stripe_customer_id AS "stripeCustomerId",
            stripe_subscription_id AS "stripeSubscriptionId", status, current_period_end AS "currentPeriodEnd"
       FROM subscriptions WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function upsertSubscriptionCustomer(pool: Pool, userId: string, stripeCustomerId: string): Promise<void> {
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2, updated_at = now()`,
    [userId, stripeCustomerId],
  );
}

export async function updateSubscriptionStatus(
  pool: Pool,
  userId: string,
  fields: { stripeCustomerId?: string; stripeSubscriptionId?: string | null; status?: string | null; currentPeriodEnd?: Date | null },
): Promise<void> {
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id = COALESCE($2, subscriptions.stripe_customer_id),
       stripe_subscription_id = COALESCE($3, subscriptions.stripe_subscription_id),
       status = COALESCE($4, subscriptions.status),
       current_period_end = COALESCE($5, subscriptions.current_period_end),
       updated_at = now()`,
    [userId, fields.stripeCustomerId ?? null, fields.stripeSubscriptionId ?? null, fields.status ?? null, fields.currentPeriodEnd ?? null],
  );
}
