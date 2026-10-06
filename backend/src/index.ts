import { env } from "./config/env";
import { pool } from "./db/pool";
import { createApp } from "./app";
import { SponsorIndexHolder } from "./services/sponsorIndexHolder";
import { loadSocOccupations } from "./appContext";
import { RealGoogleTokenVerifier } from "./services/googleAuth.service";
import { createStripeClient } from "./services/stripe.service";
import type { AppContext } from "./appContext";

const SPONSOR_INDEX_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // picks up a refresh-sponsors.ts run without a redeploy

async function main() {
  const sponsorIndexHolder = await SponsorIndexHolder.create(pool);

  const ctx: AppContext = {
    pool,
    sponsorIndexHolder,
    socOccupations: loadSocOccupations(),
    googleVerifier: new RealGoogleTokenVerifier(),
    stripe:
      env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes("placeholder")
        ? createStripeClient(env.STRIPE_SECRET_KEY)
        : null,
  };

  setInterval(() => {
    sponsorIndexHolder.refresh(pool).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Failed to refresh sponsor index:", err);
    });
  }, SPONSOR_INDEX_REFRESH_INTERVAL_MS).unref();

  const app = createApp(ctx);
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `Backend listening on :${env.PORT} (${ctx.sponsorIndexHolder.current.size()} Skilled Worker sponsors loaded, snapshot ${ctx.sponsorIndexHolder.snapshotDate ?? "unknown"})`,
    );
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during backend startup:", err);
  process.exit(1);
});
