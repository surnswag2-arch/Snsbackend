import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { createCheckoutSchema, creatorTierSchema } from "../db/schema";
import { SupabaseClient } from "../db/client";
import { PaymentGateway, StripeProvider } from "../services/payment.service";

const payments = new Hono<{ Variables: Variables }>();

// ── POST /payments/checkout ──
payments.post("/checkout", authMiddleware, zValidator("json", createCheckoutSchema), async (c) => {
  const user = c.get("user")!;
  const { amount, currency, provider } = c.req.valid("json");

  const gateway = new PaymentGateway();
  gateway.register(new StripeProvider((c.env as any).STRIPE_SECRET_KEY as string));

  const session = await gateway.createCheckout({
    amount,
    currency,
    successUrl: "https://surswag.com/payment/success",
    cancelUrl: "https://surswag.com/payment/cancel",
    metadata: { userId: user.id },
    provider,
  });

  return c.json({
    checkout_url: session.url,
    session_id: session.id,
    amount,
    currency,
    provider: provider || "stripe",
    status: session.status,
  });
});

// ── POST /payments/webhook/stripe ──
payments.post("/webhook/stripe", async (c) => {
  const signature = c.req.header("stripe-signature") || "";
  const payload = await c.req.text();

  const gateway = new PaymentGateway();
  gateway.register(new StripeProvider((c.env as any).STRIPE_SECRET_KEY as string));

  try {
    const event = await gateway.verifyWebhook("stripe", payload, signature);
    // Handle event types
    if (event && typeof event === "object" && "type" in event) {
      const evt = event as { type: string; data?: { object?: { id?: string; metadata?: Record<string, string> } } };
      if (evt.type === "checkout.session.completed" && evt.data?.object) {
        const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
        const userId = evt.data.object.metadata?.userId;
        if (userId) {
          await db.insert("ledger", {
            user_id: userId,
            type: "coin_purchase",
            amount: Math.floor((evt.data.object as { amount_total?: number }).amount_total || 0) / 100,
            currency: "usd",
            balance_before: 0,
            balance_after: 0,
            provider_txn_id: evt.data.object.id,
            metadata: { webhook_event: evt.type },
          });
        }
      }
    }
  } catch {
    return c.json({ error: { code: "WEBHOOK_ERROR", message: "Invalid webhook signature" } }, 400);
  }

  return c.json({ received: true });
});

// ── POST /payments/coins/create-order ──
payments.post("/coins/create-order", authMiddleware, zValidator("json", z.object({
  amount: z.number().int().positive(),
  currency: z.string().default("bdt"),
  provider: z.string().default("stripe"),
})), async (c) => {
  const user = c.get("user")!;
  const { amount, currency, provider } = c.req.valid("json");

  const gateway = new PaymentGateway();
  gateway.register(new StripeProvider((c.env as any).STRIPE_SECRET_KEY as string));

  const intent = await gateway.createPaymentIntent({ amount, currency, metadata: { userId: user.id }, description: `Coin purchase - ${amount} coins` });

  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  await db.insert("ledger", {
    user_id: user.id,
    type: "coin_purchase",
    amount,
    currency,
    balance_before: 0,
    balance_after: 0,
    payment_provider: provider,
    provider_txn_id: intent.id,
    metadata: { status: "pending" },
  });

  return c.json({
    order_id: intent.id,
    client_secret: intent.clientSecret,
    amount,
    currency,
    provider,
    status: intent.status,
  });
});

// ── GET /payments/balance ──
payments.get("/balance", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  const earnings = await db.select<Record<string, unknown>>("ledger", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "type", operator: "in", value: ["subscription_payout", "creator_fund_payout", "gift_received"] },
  ]);

  const lifetimeEarnings = earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return c.json({
    coin_balance: Number(profile?.coin_balance || 0),
    lifetime_earnings: lifetimeEarnings,
    currency: "bdt",
  });
});

// ── POST /subscriptions/creator/tier ──
payments.post("/subscriptions/creator/tier", authMiddleware, zValidator("json", creatorTierSchema), async (c) => {
  const user = c.get("user")!;
  const { tier, price, currency } = c.req.valid("json");

  const gateway = new PaymentGateway();
  gateway.register(new StripeProvider((c.env as any).STRIPE_SECRET_KEY as string));
  // In production: create Stripe product + price via Stripe SDK
  // For now use the gateway's pattern

  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  await db.insert("subscriptions", {
    creator_id: user.id,
    subscriber_id: user.id,
    tier,
    status: "active",
    current_period_start: new Date().toISOString(),
  });

  return c.json({ tier, price, currency, status: "active" }, 201);
});

// ── POST /subscriptions/subscribe ──
payments.post("/subscriptions/subscribe", authMiddleware, zValidator("json", z.object({
  creator_id: z.string().uuid(),
  tier: z.enum(["monthly_basic", "monthly_premium", "annual_basic", "annual_premium"]),
  provider: z.string().default("stripe"),
})), async (c) => {
  const user = c.get("user")!;
  const { creator_id, tier } = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const result = await db.insertSingle<Record<string, unknown>>("subscriptions", {
    creator_id,
    subscriber_id: user.id,
    tier,
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  });

  return c.json({ subscription_id: result.id, status: "active", tier }, 201);
});

// ── GET /subscriptions/manage ──
payments.get("/subscriptions/manage", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const asSubscriber = await db.select<Record<string, unknown>>("subscriptions", [
    { column: "subscriber_id", operator: "eq", value: user.id },
    { column: "status", operator: "eq", value: "active" },
  ]);
  const asCreator = await db.select<Record<string, unknown>>("subscriptions", [
    { column: "creator_id", operator: "eq", value: user.id },
    { column: "status", operator: "eq", value: "active" },
  ]);

  return c.json({ as_subscriber: asSubscriber, as_creator: asCreator });
});

// ── POST /payouts/request ──
payments.post("/payouts/request", authMiddleware, zValidator("json", z.object({
  amount: z.number().int().positive(),
  method: z.enum(["bkash", "nagad", "bank", "stripe"]),
  account_details: z.record(z.unknown()),
})), async (c) => {
  const user = c.get("user")!;
  const { amount, method, account_details } = c.req.valid("json");

  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  const balance = Number(profile?.coin_balance || 0);

  if (amount > balance) {
    return c.json({ error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" } }, 400);
  }

  const result = await db.insertSingle<Record<string, unknown>>("creator_payouts", {
    creator_id: user.id,
    amount,
    currency: "bdt",
    status: "pending",
    payment_method: method,
    account_details,
  });

  return c.json({
    payout_id: result.id,
    amount,
    method,
    status: "pending",
    estimated_arrival: "2-3 business days",
  });
});

export default payments;
