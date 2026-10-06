import type { Pool } from "pg";

export async function getConfigValue(pool: Pool, key: string): Promise<string | null> {
  const result = await pool.query<{ value: string }>(`SELECT value FROM app_config WHERE key = $1`, [key]);
  return result.rows[0]?.value ?? null;
}

export async function setConfigValue(
  pool: Pool,
  key: string,
  value: string,
  updatedBy: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO app_config (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()`,
    [key, value, updatedBy],
  );
}
