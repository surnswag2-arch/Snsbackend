import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { I18nService } from "../services/i18n.service";
import { signupSchema, loginSchema, otpSchema, updateProfileSchema } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const auth = new Hono<{ Variables: Variables }>();

// ── POST /auth/signup ──
auth.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string, vars?: Record<string, string>) => I18nService.translate(key, locale, vars);

  // In production: call supabase.auth.signUp()
  // const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } }});

  return c.json({
    message: t("auth.signup.success"),
    user: {
      id: crypto.randomUUID(),
      username: body.username,
      display_name: body.display_name,
      email: body.email,
      locale: body.locale,
    },
    token: `mock_jwt_${crypto.randomUUID()}`,
  }, 201);
});

// ── POST /auth/login ──
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string, vars?: Record<string, string>) => I18nService.translate(key, locale, vars);

  // In production: call supabase.auth.signInWithPassword()
  // const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return c.json({
    message: t("auth.login.success", { name: body.email || body.username || "user" }),
    user: {
      id: crypto.randomUUID(),
      email: body.email,
      username: body.username || "user",
    },
    token: `mock_jwt_${crypto.randomUUID()}`,
  });
});

// ── POST /auth/otp/send ──
auth.post("/otp/send", zValidator("json", z.object({ phone: z.string() })), async (c) => {
  const { phone } = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string) => I18nService.translate(key, locale);

  // In production: call supabase.auth.signInWithOtp({ phone })
  // Also send SMS via Twilio or local SMS gateway

  return c.json({ message: t("auth.otp.sent"), phone });
});

// ── POST /auth/otp/verify ──
auth.post("/otp/verify", zValidator("json", otpSchema), async (c) => {
  const { phone, code } = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string) => I18nService.translate(key, locale);

  // In production: call supabase.auth.verifyOtp({ phone, token: code, type: "sms" })

  return c.json({
    message: t("auth.otp.verified"),
    token: `mock_jwt_${crypto.randomUUID()}`,
  });
});

// ── POST /auth/oauth ──
auth.post("/oauth", zValidator("json", z.object({ provider: z.enum(["google", "facebook"]), access_token: z.string() })), async (c) => {
  const { provider, access_token } = c.req.valid("json");

  // In production: call supabase.auth.signInWithIdToken({ provider, token: access_token })
  // Or: exchange token for Supabase session

  return c.json({
    message: `Logged in with ${provider}`,
    token: `mock_jwt_${crypto.randomUUID()}`,
    user: { id: crypto.randomUUID(), email: "user@example.com" },
  });
});

// ── GET /auth/me ──
auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user")!;

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      locale: user.locale,
    },
  });
});

// ── PATCH /auth/profile ──
auth.patch("/profile", authMiddleware, zValidator("json", updateProfileSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");

  // In production: update users table in Supabase

  return c.json({
    message: "Profile updated",
    user: { id: user.id, ...body },
  });
});

export default auth;
