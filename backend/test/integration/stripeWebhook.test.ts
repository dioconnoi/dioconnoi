import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import type { Express } from "express";
import request from "supertest";
import Stripe from "stripe";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { createStripeClient } from "../../src/services/stripe.service";
import { upsertUserFromGoogle, getUserById } from "../../src/services/users.service";
import { upsertSubscriptionCustomer } from "../../src/services/subscriptions.service";
import { createTestPool, resetDb, buildTestContext } from "./setup";

// stripe.webhooks.generateTestHeaderString / constructEvent are pure local
// HMAC signature operations — no network call to stripe.com is made, so
// this fully exercises the webhook handler without live Stripe credentials.
// Must match env.STRIPE_WEBHOOK_SECRET, since that's what the real handler
// verifies incoming signatures against.
const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

describe("POST /api/stripe/webhook (integration, real Postgres, synthetic signature)", () => {
  let pool: Pool;
  let app: Express;
  let stripe: Stripe;
  let userId: string;
  const stripeCustomerId = "cus_fixture_123";

  beforeAll(() => {
    pool = createTestPool();
    stripe = createStripeClient("sk_test_dummy_not_used_for_network_calls");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDb(pool);
    const user = await upsertUserFromGoogle(pool, {
      sub: "webhook-fixture-sub",
      email: "webhook-fixture@example.com",
      name: "Webhook Fixture",
      picture: null,
    });
    userId = user.id;
    await upsertSubscriptionCustomer(pool, userId, stripeCustomerId);

    const ctx = await buildTestContext(pool, { stripe });
    app = createApp(ctx);
  });

  function sendSignedWebhook(payload: object) {
    const body = JSON.stringify(payload);
    const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
    return request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", header)
      .send(body);
  }

  it("rejects a payload with an invalid signature", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=1,v1=not-a-real-signature")
      .send(JSON.stringify({ type: "checkout.session.completed" }));
    expect(res.status).toBe(400);
  });

  it("marks the user premium on checkout.session.completed", async () => {
    const before = await getUserById(pool, userId);
    expect(before?.isPremium).toBe(false);

    const res = await sendSignedWebhook({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          customer: stripeCustomerId,
          subscription: "sub_fixture_1",
        },
      },
    });

    expect(res.status).toBe(200);
    const after = await getUserById(pool, userId);
    expect(after?.isPremium).toBe(true);
  });

  it("revokes premium on customer.subscription.deleted", async () => {
    await sendSignedWebhook({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_2", customer: stripeCustomerId, subscription: "sub_fixture_1" } },
    });
    expect((await getUserById(pool, userId))?.isPremium).toBe(true);

    const res = await sendSignedWebhook({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_fixture_1",
          customer: stripeCustomerId,
          status: "canceled",
          current_period_end: Math.floor(Date.now() / 1000),
        },
      },
    });

    expect(res.status).toBe(200);
    expect((await getUserById(pool, userId))?.isPremium).toBe(false);
  });

  it("ignores events for an unknown Stripe customer without erroring", async () => {
    const res = await sendSignedWebhook({
      id: "evt_4",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_4", customer: "cus_unknown", subscription: "sub_unknown" } },
    });
    expect(res.status).toBe(200);
  });
});
