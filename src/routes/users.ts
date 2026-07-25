import { Hono } from "hono";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import { SupabaseClient } from "../db/client";

const users = new Hono<{ Variables: Variables }>();

// ── GET /users/:id ──
users.get("/:id", optionalAuthMiddleware, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: id }]);
  if (!profile) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

  // Count videos
  const videosCount = await db.count("videos", [
    { column: "creator_id", operator: "eq", value: id },
    { column: "status", operator: "eq", value: "ready" },
  ]);

  let isFollowing = false;
  if (user && user.id !== id) {
    const follow = await db.selectSingle("follows", [
      { column: "follower_id", operator: "eq", value: user.id },
      { column: "following_id", operator: "eq", value: id },
    ]);
    isFollowing = !!follow;
  }

  return c.json({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
    is_verified: Boolean(profile.is_verified),
    followers_count: Number(profile.followers_count || 0),
    following_count: Number(profile.following_count || 0),
    likes_count: Number(profile.likes_count || 0),
    videos_count: videosCount,
    is_following: isFollowing,
  });
});

// ── PATCH /users/me ──
users.patch("/me", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  // Only allow certain fields
  const allowed: Record<string, unknown> = {};
  if (typeof body.display_name === "string" && body.display_name.length <= 50) allowed.display_name = body.display_name;
  if (typeof body.bio === "string" && body.bio.length <= 150) allowed.bio = body.bio;
  if (typeof body.avatar_url === "string") allowed.avatar_url = body.avatar_url;
  if (typeof body.locale === "string") allowed.locale = body.locale;

  if (Object.keys(allowed).length > 0) {
    await db.update("users", [{ column: "id", operator: "eq", value: user.id }], allowed);
  }

  const updated = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  return c.json({ message: "Profile updated", user: updated });
});

export default users;
