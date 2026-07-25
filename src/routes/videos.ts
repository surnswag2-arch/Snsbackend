import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import { feedQuerySchema } from "../db/schema";
import { SupabaseClient, type QueryFilter } from "../db/client";
import { CacheService } from "../services/cache.service";

const videos = new Hono<{ Variables: Variables }>();

// ── GET /videos/feed ──
videos.get("/feed", optionalAuthMiddleware, zValidator("query", feedQuerySchema), async (c) => {
  const { type, cursor, limit } = c.req.valid("query");
  const user = c.get("user");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const cache = new CacheService(c.env as { UPSTASH_REDIS_URL: string; UPSTASH_REDIS_TOKEN: string });

  if (type === "following" && user) {
    // Following feed: videos from creators the user follows
    const following = await db.select<{ following_id: string }>(
      "follows",
      [{ column: "follower_id", operator: "eq", value: user.id }],
      { column: "created_at", direction: "desc" },
    );
    if (following.length === 0) {
      return c.json({ data: [], nextCursor: undefined, hasMore: false });
    }
    const followingIds = following.map((f) => f.following_id);
    const filters: QueryFilter[] = [
      { column: "creator_id", operator: "in", value: followingIds },
      { column: "status", operator: "eq", value: "ready" },
      { column: "privacy", operator: "eq", value: "public" },
    ];
    if (cursor) {
      filters.push({ column: "created_at", operator: "lt", value: cursor });
    }
    const rows = await db.select<Record<string, unknown>>(
      "videos", filters, { column: "created_at", direction: "desc" }, limit,
    );
    const data = rows.map((r) => enrichVideo(r, db));
    return c.json({
      data: await Promise.all(data),
      nextCursor: rows.length === limit ? rows[rows.length - 1]?.created_at as string | undefined : undefined,
      hasMore: rows.length === limit,
    });
  }

  // For You feed: trending algorithm
  const cacheKey = `feed:foryou:${user?.id || "anon"}:${cursor || "0"}:${limit}`;
  const cached = await cache.get<{ data: unknown[]; nextCursor: string | undefined; hasMore: boolean }>(cacheKey);
  if (cached) return c.json(cached);

  const filters: QueryFilter[] = [
    { column: "status", operator: "eq", value: "ready" },
    { column: "privacy", operator: "eq", value: "public" },
  ];
  if (cursor) {
    filters.push({ column: "created_at", operator: "lt", value: cursor });
  }

  // Fetch slightly more than limit so we can apply trending sort client-side
  const rows = await db.select<Record<string, unknown>>(
    "videos", filters, { column: "created_at", direction: "desc" }, limit * 2,
  );

  // Trending score: likes_count / hours_since_creation (min 1h)
  const now = Date.now();
  const scored = rows.map((r) => {
    const created = new Date(r.created_at as string).getTime();
    const hoursSince = Math.max(1, (now - created) / 3600000);
    const score = (Number(r.likes_count) || 0) / hoursSince;
    return { row: r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  const data = await Promise.all(top.map((s) => enrichVideo(s.row, db, user?.id)));
  const result = {
    data,
    nextCursor: rows.length >= limit ? rows[Math.min(limit - 1, rows.length - 1)]?.created_at as string | undefined : undefined,
    hasMore: rows.length >= limit,
  };

  await cache.set(cacheKey, result, 60);
  return c.json(result);
});

async function enrichVideo(row: Record<string, unknown>, db: SupabaseClient, currentUserId?: string): Promise<Record<string, unknown>> {
  const creatorId = row.creator_id as string;
  const creator = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: creatorId }]);
  let isLiked = false;
  let isFollowing = false;

  if (currentUserId) {
    const like = await db.selectSingle("likes", [
      { column: "user_id", operator: "eq", value: currentUserId },
      { column: "video_id", operator: "eq", value: row.id as string },
    ]);
    isLiked = !!like;

    const follow = await db.selectSingle("follows", [
      { column: "follower_id", operator: "eq", value: currentUserId },
      { column: "following_id", operator: "eq", value: creatorId },
    ]);
    isFollowing = !!follow;
  }

  return {
    id: row.id,
    creator_id: creatorId,
    caption: row.caption || "",
    hashtags: row.hashtags || [],
    status: row.status || "ready",
    thumbnail_url: row.thumbnail_url || "",
    duration: row.duration || 0,
    likes_count: row.likes_count || 0,
    comments_count: row.comments_count || 0,
    shares_count: row.shares_count || 0,
    views_count: row.views_count || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    creator: creator ? {
      id: creator.id,
      username: creator.username,
      display_name: creator.display_name,
      avatar_url: creator.avatar_url || "",
      is_verified: creator.is_verified || false,
    } : null,
    is_liked: isLiked,
    is_following: isFollowing,
  };
}

// ── GET /videos/:id ──
videos.get("/:id", optionalAuthMiddleware, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: id }]);
  if (!video) return c.json({ error: { code: "NOT_FOUND", message: "Video not found" } }, 404);

  // Increment views
  await db.update("videos", [{ column: "id", operator: "eq", value: id }], {
    views_count: (Number(video.views_count) || 0) + 1,
  });

  const enriched = await enrichVideo(video, db, user?.id);
  return c.json(enriched);
});

// ── POST /videos/:id/like ──
videos.post("/:id/like", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  // Check video exists
  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (!video) return c.json({ error: { code: "NOT_FOUND", message: "Video not found" } }, 404);

  // Prevent duplicate
  const existing = await db.selectSingle("likes", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "video_id", operator: "eq", value: videoId },
  ]);
  if (existing) return c.json({ message: "Already liked", videoId, likes_count: video.likes_count });

  await db.insert("likes", { user_id: user.id, video_id: videoId });
  const newCount = (Number(video.likes_count) || 0) + 1;
  await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], { likes_count: newCount });

  // Create notification for video creator
  if (video.creator_id !== user.id) {
    try {
      const { NotificationService } = await import("../services/notification.service");
      const ns = new NotificationService(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
      await ns.create({
        userId: video.creator_id as string,
        type: "like",
        actorId: user.id,
        videoId,
        message: "আপনার ভিডিও পছন্দ করেছে",
        locale: "bn",
      });
    } catch { /* notification failure is non-critical */ }
  }

  return c.json({ message: "Video liked", videoId, likes_count: newCount });
});

// ── POST /videos/:id/unlike ──
videos.post("/:id/unlike", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  await db.delete_("likes", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "video_id", operator: "eq", value: videoId },
  ]);

  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (video) {
    const newCount = Math.max(0, (Number(video.likes_count) || 0) - 1);
    await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], { likes_count: newCount });
  }

  return c.json({ message: "Video unliked", videoId });
});

// ── POST /videos/:id/view ──
videos.post("/:id/view", optionalAuthMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (video) {
    await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], {
      views_count: (Number(video.views_count) || 0) + 1,
    });
  }

  return c.json({ success: true });
});

// ── DELETE /videos/:id ──
videos.delete("/:id", authMiddleware, async (c) => {
  const videoId = c.req.param("id");
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (!video) return c.json({ error: { code: "NOT_FOUND", message: "Video not found" } }, 404);
  if (video.creator_id !== user.id) return c.json({ error: { code: "FORBIDDEN", message: "Not your video" } }, 403);

  await db.delete_("videos", [{ column: "id", operator: "eq", value: videoId }]);

  // Remove from search index
  try {
    const { SearchService } = await import("../services/search.service");
    const ss = new SearchService(c.env as { MEILISEARCH_URL: string; MEILISEARCH_API_KEY: string });
    await ss.deleteDocument("videos", videoId);
  } catch { /* search cleanup non-critical */ }

  return c.json({ message: "Video deleted" });
});

export default videos;
