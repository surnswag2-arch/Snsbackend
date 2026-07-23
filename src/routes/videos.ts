import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import { feedQuerySchema } from "../db/schema";

const videos = new Hono<{ Variables: Variables }>();

// ── GET /videos/feed ──
videos.get("/feed", optionalAuthMiddleware, zValidator("query", feedQuerySchema), async (c) => {
  const { type, cursor, limit } = c.req.valid("query");
  const user = c.get("user");
  const locale = c.get("locale");

  // In production:
  // 1. Check Redis cache for pre-computed feed
  // 2. If miss: query Postgres (read replica) for candidate videos
  //    - For You: recent popular videos + from followed accounts + locale-matched
  //    - Following: videos from accounts the user follows, chronological
  // 3. Apply lightweight ranking
  // 4. Cache in Redis with short TTL
  // 5. Return paginated results

  const mockFeed = Array.from({ length: limit }, (_, i) => ({
    id: crypto.randomUUID(),
    creator_id: crypto.randomUUID(),
    caption: locale === "bn" ? "আমার নতুন ভিডিও 🎬" : "My new video 🎬",
    hashtags: ["trending", "viral"],
    status: "ready",
    thumbnail_url: "",
    duration: 15,
    likes_count: Math.floor(Math.random() * 50000),
    comments_count: Math.floor(Math.random() * 2000),
    shares_count: Math.floor(Math.random() * 1000),
    views_count: Math.floor(Math.random() * 200000),
    creator: {
      id: crypto.randomUUID(),
      username: `user_${i}`,
      display_name: `User ${i}`,
      avatar_url: `https://api.dicebear.com/9.x/avataaars/svg?seed=${i}`,
      is_verified: i % 3 === 0,
    },
    sound: {
      id: crypto.randomUUID(),
      title: locale === "bn" ? "ট্রেন্ডিং গান" : "Trending Song",
      artist: locale === "bn" ? "জনপ্রিয় শিল্পী" : "Popular Artist",
    },
    created_at: new Date().toISOString(),
  }));

  return c.json({
    data: mockFeed,
    nextCursor: mockFeed.length === limit ? cursor || "next_page_token" : undefined,
    hasMore: mockFeed.length === limit,
  });
});

// ── GET /videos/:id ──
videos.get("/:id", optionalAuthMiddleware, async (c) => {
  const id = c.req.param("id");

  // In production: fetch from Postgres + increment view counter

  return c.json({
    id,
    creator_id: crypto.randomUUID(),
    caption: "Video detail",
    likes_count: 45200,
    comments_count: 1230,
    status: "ready",
  });
});

// ── POST /videos/:id/like ──
videos.post("/:id/like", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;

  // In production:
  // 1. Check if already liked (return 409 if so)
  // 2. Increment like buffer in Redis
  // 3. Queue flush-likes job (delayed, batches writes)
  // 4. Return new like count

  return c.json({
    message: "Video liked",
    videoId,
    likes_count: 45301, // incremented
  });
});

// ── POST /videos/:id/unlike ──
videos.post("/:id/unlike", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;

  return c.json({
    message: "Video unliked",
    videoId,
  });
});

// ── POST /videos/:id/view ──
videos.post("/:id/view", optionalAuthMiddleware, async (c) => {
  const videoId = c.req.param("id");

  // In production: increment view counter (buffered via Redis)

  return c.json({ success: true });
});

// ── DELETE /videos/:id ──
videos.delete("/:id", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;

  // In production: soft-delete or mark as deleted in Postgres
  // Also remove from search index

  return c.json({ message: "Video deleted" });
});

export default videos;
