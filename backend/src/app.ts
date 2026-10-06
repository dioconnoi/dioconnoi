import express, { type Express } from "express";
import cors from "cors";
import type { AppContext } from "./appContext";
import { corsAllowedOrigins } from "./config/env";
import { createAuthRouter } from "./routes/auth.routes";
import { createMeRouter } from "./routes/me.routes";
import { createCheckRouter, createSocSearchRouter } from "./routes/check.routes";
import { createBillingRouter, createStripeWebhookHandler } from "./routes/billing.routes";
import { createAdminRouter } from "./routes/admin.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp(ctx: AppContext): Express {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server, same-origin) is allowed through;
        // browser/extension requests are checked against the configured allow-list.
        if (!origin || corsAllowedOrigins.length === 0 || corsAllowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not allowed`));
        }
      },
    }),
  );

  // Stripe webhook needs the raw request body for signature verification, so
  // it must be mounted with express.raw() BEFORE the app-wide express.json()
  // below — once json() has parsed the body there is no way to recover the
  // exact original bytes the signature was computed over.
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    createStripeWebhookHandler(ctx),
  );

  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, sponsorCount: ctx.sponsorIndexHolder.current.size() });
  });

  app.use("/api/auth", createAuthRouter(ctx));
  app.use("/api/me", createMeRouter(ctx));
  app.use("/api/check", createCheckRouter(ctx));
  app.use("/api/soc", createSocSearchRouter(ctx));
  app.use("/api/billing", createBillingRouter(ctx));
  app.use("/api/admin", createAdminRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
