import { z } from "zod";

// ─── Auth ───
export const signupSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  display_name: z.string().min(1).max(50),
  password: z.string().min(8).max(128),
  locale: z.string().default("bn"),
});

export const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  username: z.string().optional(),
  password: z.string(),
});

export const otpSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});

export const oauthSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  access_token: z.string(),
});

// ─── Profile ───
export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  bio: z.string().max(150).optional(),
  avatar_url: z.string().url().optional(),
  locale: z.string().length(2).optional(),
});

// ─── Upload ───
export const requestUploadSchema = z.object({
  filename: z.string(),
  content_type: z.string(),
  file_size: z.number().max(500 * 1024 * 1024), // 500MB max
});

export const uploadCallbackSchema = z.object({
  r2_key: z.string(),
  stream_uid: z.string().optional(),
  status: z.enum(["processing", "ready", "failed"]).optional(),
});

// ─── Video ───
export const createVideoSchema = z.object({
  r2_key: z.string(),
  caption: z.string().max(500).default(""),
  hashtags: z.array(z.string()).default([]),
  sound_id: z.string().uuid().nullable().optional(),
  privacy: z.enum(["public", "friends", "private"]).default("public"),
  allow_comments: z.boolean().default(true),
  allow_duet: z.boolean().default(true),
  allow_stitch: z.boolean().default(true),
  allow_download: z.boolean().default(true),
  locale: z.string().default("bn"),
});

export const feedQuerySchema = z.object({
  type: z.enum(["foryou", "following"]).default("foryou"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

// ─── Social ───
export const createCommentSchema = z.object({
  text: z.string().min(1).max(1000),
  parent_id: z.string().uuid().optional(),
});

export const reportSchema = z.object({
  target_type: z.enum(["video", "user", "comment"]),
  target_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

// ─── Payments ───
export const createCheckoutSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("usd"),
  provider: z.string().default("stripe"),
});

export const creatorTierSchema = z.object({
  tier: z.enum(["monthly_basic", "monthly_premium", "annual_basic", "annual_premium"]),
  price: z.number().int().positive(),
  currency: z.string().default("usd"),
});

// ─── Search ───
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  type: z.enum(["videos", "users", "sounds", "hashtags"]).default("videos"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
