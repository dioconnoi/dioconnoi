import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import type { AppContext } from "../appContext";
import { requireAuth } from "../middleware/requireAuth";
import { getUserById, setPremiumStatus, getUserByStripeCustomerId } from "../services/users.service";
import {
  getSubscriptionByUserId,
  upsertSubscriptionCustomer,
  updateSubscriptionStatus,
} from "../services/subscriptions.service";
import { env } from "../config/env";
import { HttpError } from "../lib/httpError";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function createBillingRouter(ctx: AppContext): Router {
  const router = Router();

  router.post("/create-checkout-session", requireAuth, async (req, res, next) => {
    try {
      if (!ctx.stripe) throw new HttpError(503, "Billing is not configured on this server");

      const user = await getUserById(ctx.pool, req.userId!);
      if (!user) throw new HttpError(404, "User not found");

      let subscription = await getSubscriptionByUserId(ctx.pool, user.id);
      let stripeCustomerId = subscription?.stripeCustomerId ?? null;

      if (!stripeCustomerId) {
        const customer = await ctx.stripe.customers.create({
          email: user.email ?? undefined,
          metadata: { userId: user.id },
        });
        stripeCustomerId = customer.id;
        await upsertSubscriptionCustomer(ctx.pool, user.id, stripeCustomerId);
      }

      const successUrl = typeof req.body?.successUrl === "string" ? req.body.successUrl : "https://example.com/premium/success";
      const cancelUrl = typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : "https://example.com/premium/cancel";

      const session = await ctx.stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Mounted directly in app.ts with express.raw() BEFORE the app-wide
 * express.json() middleware — Stripe signature verification needs the exact
 * raw request bytes, which a JSON body parser would already have consumed
 * and re-serialized by the time it reached a normal route handler.
 */
export function createStripeWebhookHandler(ctx: AppContext) {
  return async (req: Request, res: Response) => {
    if (!ctx.stripe) {
      res.status(503).json({ error: "Billing is not configured on this server" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    let event: Stripe.Event;
    try {
      event = ctx.stripe.webhooks.constructEvent(req.body, signature as string, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const customerId = session.customer as string | null;
          const subscriptionId = session.subscription as string | null;
          if (customerId) {
            const user = await getUserByStripeCustomerId(ctx.pool, customerId);
            if (user) {
              await updateSubscriptionStatus(ctx.pool, user.id, {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId ?? undefined,
                status: "active",
              });
              await setPremiumStatus(ctx.pool, user.id, true);
            }
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;
          const user = await getUserByStripeCustomerId(ctx.pool, customerId);
          if (user) {
            const isActive = ACTIVE_STATUSES.has(sub.status);
            await updateSubscriptionStatus(ctx.pool, user.id, {
              stripeSubscriptionId: sub.id,
              status: sub.status,
              currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
            });
            await setPremiumStatus(ctx.pool, user.id, isActive);
          }
          break;
        }
        default:
          break; // other event types are not relevant to this product
      }
      res.json({ received: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error handling Stripe webhook event:", err);
      res.status(500).json({ error: "Webhook handler error" });
    }
  };
}
