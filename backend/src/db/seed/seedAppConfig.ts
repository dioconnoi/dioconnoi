import { pool } from "../pool";
import { env } from "../../config/env";

async function main() {
  await pool.query(
    `INSERT INTO app_config (key, value, updated_by)
     VALUES ('free_daily_quota', $1, 'seed')
     ON CONFLICT (key) DO NOTHING`,
    [String(env.FREE_DAILY_QUOTA_DEFAULT)],
  );
  // eslint-disable-next-line no-console
  console.log(`Seeded app_config.free_daily_quota (default ${env.FREE_DAILY_QUOTA_DEFAULT}, left untouched if already set)`);
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
