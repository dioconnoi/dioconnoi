import type { Pool } from "pg";
import type { GoogleUserInfo } from "./googleAuth.service";

export interface UserRecord {
  id: string;
  googleSub: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
}

const SELECT_COLUMNS = `id, google_sub AS "googleSub", email, display_name AS "displayName",
  avatar_url AS "avatarUrl", is_premium AS "isPremium"`;

export async function upsertUserFromGoogle(pool: Pool, info: GoogleUserInfo): Promise<UserRecord> {
  const result = await pool.query<UserRecord>(
    `INSERT INTO users (google_sub, email, display_name, avatar_url, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (google_sub) DO UPDATE
       SET email = $2, display_name = $3, avatar_url = $4, last_login_at = now(), updated_at = now()
     RETURNING ${SELECT_COLUMNS}`,
    [info.sub, info.email, info.name, info.picture],
  );
  return result.rows[0];
}

export async function getUserById(pool: Pool, id: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function setPremiumStatus(pool: Pool, userId: string, isPremium: boolean): Promise<void> {
  await pool.query(`UPDATE users SET is_premium = $2, updated_at = now() WHERE id = $1`, [userId, isPremium]);
}

export async function getUserByStripeCustomerId(pool: Pool, stripeCustomerId: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT u.id, u.google_sub AS "googleSub", u.email, u.display_name AS "displayName",
            u.avatar_url AS "avatarUrl", u.is_premium AS "isPremium"
       FROM users u
       JOIN subscriptions s ON s.user_id = u.id
      WHERE s.stripe_customer_id = $1`,
    [stripeCustomerId],
  );
  return result.rows[0] ?? null;
}
