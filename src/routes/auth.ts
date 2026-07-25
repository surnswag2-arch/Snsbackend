import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { I18nService } from "../services/i18n.service";
import { signupSchema, loginSchema, otpSchema, updateProfileSchema } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { SupabaseAuth } from "../db/auth";
import { SupabaseClient } from "../db/client";
import { toUserResponse } from "../utils/transformers";

const auth = new Hono<{ Variables: Variables }>();

// ── POST /auth/signup ──
auth.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string, vars?: Record<string, string>) => I18nService.translate(key, locale, vars);

  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  if (!body.email && !body.phone) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Email or phone is required" } }, 400);
  }

  const email = body.email || `${body.username}@placeholder.com`;
  const { access_token, user_id } = await supabaseAuth.signUp(email, body.password, {
    username: body.username,
    display_name: body.display_name,
    locale: body.locale || "bn",
  });

  await db.insert("users", {
    id: user_id,
    email: body.email || null,
    phone: body.phone || null,
    username: body.username,
    display_name: body.display_name,
    locale: body.locale || "bn",
    bio: "",
    avatar_url: "",
    is_verified: false,
    followers_count: 0,
    following_count: 0,
    coin_balance: 0,
  });

  return c.json({
    message: t("auth.signup.success"),
    user: { id: user_id, username: body.username, display_name: body.display_name, email: body.email, locale: body.locale || "bn" },
    token: access_token,
  }, 201);
});

// ── POST /auth/login ──
auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string, vars?: Record<string, string>) => I18nService.translate(key, locale, vars);

  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  // Resolve identifier to email
  let email = body.email;
  if (!email && body.username) {
    const user = await db.selectSingle<Record<string, unknown>>("users", [{ column: "username", operator: "eq", value: body.username }]);
    email = user?.email as string | undefined;
  }
  if (!email && body.phone) {
    const user = await db.selectSingle<Record<string, unknown>>("users", [{ column: "phone", operator: "eq", value: body.phone }]);
    email = user?.email as string | undefined;
  }
  if (!email) {
    return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }, 401);
  }

  const { access_token, refresh_token, user } = await supabaseAuth.signInWithPassword(email, body.password);

  return c.json({
    message: t("auth.login.success", { name: user.username }),
    user,
    token: access_token,
    refresh_token,
  });
});

// ── POST /auth/otp/send ──
auth.post("/otp/send", zValidator("json", z.object({ phone: z.string() })), async (c) => {
  const { phone } = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string) => I18nService.translate(key, locale);

  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  await supabaseAuth.sendOtp(phone);

  return c.json({ message: t("auth.otp.sent"), phone });
});

// ── POST /auth/otp/verify ──
auth.post("/otp/verify", zValidator("json", otpSchema), async (c) => {
  const { phone, code } = c.req.valid("json");
  const locale = c.get("locale");
  const t = (key: string) => I18nService.translate(key, locale);

  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  const { access_token, refresh_token } = await supabaseAuth.verifyOtp(phone, code);

  return c.json({ message: t("auth.otp.verified"), token: access_token, refresh_token });
});

// ── POST /auth/refresh ──
auth.post("/refresh", zValidator("json", z.object({ refresh_token: z.string() })), async (c) => {
  const { refresh_token } = c.req.valid("json");
  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  const tokens = await supabaseAuth.refreshToken(refresh_token);
  return c.json({ token: tokens.access_token, refresh_token: tokens.refresh_token });
});

// ── POST /auth/oauth ──
auth.post("/oauth", zValidator("json", z.object({ provider: z.enum(["google", "facebook"]), access_token: z.string() })), async (c) => {
  const { provider, access_token } = c.req.valid("json");
  const supabaseAuth = new SupabaseAuth(c.env as { SUPABASE_URL: string; SUPABASE_ANON_KEY: string });
  const result = await supabaseAuth.signInWithIdToken(provider, access_token);
  return c.json({ message: `Logged in with ${provider}`, token: result.access_token, refresh_token: result.refresh_token, user: result.user });
});

// ── POST /auth/logout ──
auth.post("/logout", async (c) => {
  return c.json({ message: "Logged out" });
});

// ── GET /auth/me ──
auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json({ user: toUserResponse(profile) });
});

// ── PATCH /auth/profile ──
auth.patch("/profile", authMiddleware, zValidator("json", updateProfileSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  await db.update("users", [{ column: "id", operator: "eq", value: user.id }], body as Record<string, unknown>);
  const updated = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  return c.json({ message: "Profile updated", user: updated ? toUserResponse(updated) : { id: user.id, ...body } });
});

export default auth;
