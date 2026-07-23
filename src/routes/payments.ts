import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { createCheckoutSchema, creatorTierSchema } from "../db/schema";

const payments = new Hono<{ Variables: Variables }>();

// ── POST /payments/checkout ──
payments.post("/checkout", authMiddleware, zValidator("json", createCheckoutSchema), async (c) => {
  const user = c.get("user")!;
  const { amount, currency, provider } = c.req.valid("json");

  // In production:
  // const gateway = new PaymentGateway();
  // gateway.register(new StripeProvider(env.STRIPE_SECRET_KEY));
  // const session = await gateway.createCheckout({
  //   amount,
  //   currency,
  //   successUrl: "https://surswag.com/payment/success",
  //   cancelUrl: "https://surswag.com/payment/cancel",
  //   metadata: { userId: user.id },
  //   provider,
  // });

  return c.json({
    checkout_url: `https://checkout.example.com/${crypto.randomUUID()}`,
    amount,
    currency,
    provider: provider || "stripe",
    status: "pending",
  });
});

// ── POST /payments/webhook/stripe ──
payments.post("/webhook/stripe", async (c) => {
  const signature = c.req.header("stripe-signature") || "";

  // In production:
  // const payload = await c.req.text();
  // const event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  // Handle event types: checkout.session.completed, invoice.paid, customer.subscription.updated

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

  // In production: create a payment intent, record in ledger

  return c.json({
    order_id: `ord_${crypto.randomUUID()}`,
    amount,
    currency,
    provider,
    status: "pending",
  });
});

// ── GET /payments/balance ──
payments.get("/balance", authMiddleware, async (c) => {
  const user = c.get("user")!;

  // In production: fetch user's coin balance and lifetime earnings

  return c.json({
    coin_balance: 1500,
    lifetime_earnings: 25000,
    currency: "bdt",
  });
});

// ── POST /subscriptions/creator/tier ──
payments.post("/subscriptions/creator/tier", authMiddleware, zValidator("json", creatorTierSchema), async (c) => {
  const user = c.get("user")!;
  const { tier, price, currency } = c.req.valid("json");

  // In production: create Stripe price + product, store tier info

  return c.json({
    tier,
    price,
    currency,
    status: "active",
    price_id: `price_${crypto.randomUUID()}`,
  }, 201);
});

// ── POST /subscriptions/subscribe ──
payments.post("/subscriptions/subscribe", authMiddleware, zValidator("json", z.object({
  creator_id: z.string().uuid(),
  tier: z.enum(["monthly_basic", "monthly_premium", "annual_basic", "annual_premium"]),
  provider: z.string().default("stripe"),
})), async (c) => {
  const user = c.get("user")!;
  const { creator_id, tier, provider } = c.req.valid("json");

  // In production: create Stripe subscription + record in subscriptions table

  return c.json({
    subscription_id: `sub_${crypto.randomUUID()}`,
    status: "active",
    tier,
  }, 201);
});

// ── GET /subscriptions/manage ──
payments.get("/subscriptions/manage", authMiddleware, async (c) => {
  const user = c.get("user")!;

  // In production: return user's active subscriptions (as subscriber) + their subscription tiers (as creator)

  return c.json({
    as_subscriber: [],
    as_creator: [],
  });
});

// ── POST /payouts/request ──
payments.post("/payouts/request", authMiddleware, zValidator("json", z.object({
  amount: z.number().int().positive(),
  method: z.enum(["bkash", "nagad", "bank", "stripe"]),
  account_details: z.record(z.unknown()),
})), async (c) => {
  const user = c.get("user")!;
  const { amount, method } = c.req.valid("json");

  // In production: check balance, create payout record, queue payout processing

  return c.json({
    payout_id: `po_${crypto.randomUUID()}`,
    amount,
    method,
    status: "pending",
    estimated_arrival: "2-3 business days",
  });
});

export default payments;
