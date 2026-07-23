import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";

const users = new Hono<{ Variables: Variables }>();

// ── GET /users/:id ──
users.get("/:id", optionalAuthMiddleware, async (c) => {
  const { id } = c.req.param();

  // In production: fetch from users table + count videos/followers/following

  return c.json({
    id,
    username: "user_demo",
    display_name: "Demo User",
    bio: "এই হল আমার প্রোফাইল 🎵",
    avatar_url: "",
    followers_count: 12400,
    following_count: 382,
    likes_count: 195000,
    videos_count: 47,
    is_verified: true,
  });
});

// ── PATCH /users/me ──
users.patch("/me", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));

  // In production: update users table

  return c.json({ message: "Profile updated", id: user.id, ...body });
});

export default users;
