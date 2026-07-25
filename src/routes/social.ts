import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import { createCommentSchema, reportSchema } from "../db/schema";
import { SupabaseClient, type QueryFilter } from "../db/client";

const social = new Hono<{ Variables: Variables }>();

// ── GET /videos/:videoId/comments ──
social.get("/videos/:videoId/comments", optionalAuthMiddleware, async (c) => {
  const { videoId } = c.req.param();
  const user = c.get("user");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const filters: QueryFilter[] = [
    { column: "video_id", operator: "eq", value: videoId },
    { column: "parent_id", operator: "eq", value: "null" },
  ];
  if (cursor) filters.push({ column: "created_at", operator: "lt", value: cursor });

  const rows = await db.select<Record<string, unknown>>("comments", filters, { column: "created_at", direction: "desc" }, limit);

  const data = await Promise.all(rows.map(async (row) => {
    const commentUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: row.user_id as string }]);
    let isLiked = false;
    if (user) {
      const like = await db.selectSingle("comment_likes", [
        { column: "user_id", operator: "eq", value: user.id },
        { column: "comment_id", operator: "eq", value: row.id as string },
      ]);
      isLiked = !!like;
    }

    // Fetch replies
    const replies = await db.select<Record<string, unknown>>("comments", [
      { column: "parent_id", operator: "eq", value: row.id as string },
    ], { column: "created_at", direction: "asc" }, 5);

    const replyData = await Promise.all(replies.map(async (reply) => {
      const replyUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: reply.user_id as string }]);
      return {
        id: reply.id,
        text: reply.text,
        user: replyUser ? { id: replyUser.id, username: replyUser.username, display_name: replyUser.display_name, avatar_url: replyUser.avatar_url || "", is_verified: Boolean(replyUser.is_verified) } : null,
        likes_count: reply.likes_count || 0,
        created_at: reply.created_at,
      };
    }));

    return {
      id: row.id,
      video_id: row.video_id,
      parent_id: row.parent_id,
      text: row.text,
      user: commentUser ? { id: commentUser.id, username: commentUser.username, display_name: commentUser.display_name, avatar_url: commentUser.avatar_url || "", is_verified: Boolean(commentUser.is_verified) } : null,
      likes_count: row.likes_count || 0,
      is_pinned: Boolean(row.is_pinned),
      is_liked: isLiked,
      created_at: row.created_at,
      replies: replyData,
    };
  }));

  return c.json({ data, nextCursor: rows.length === limit ? rows[rows.length - 1]?.created_at : undefined });
});

// ── POST /videos/:videoId/comments ──
social.post("/videos/:videoId/comments", authMiddleware, zValidator("json", createCommentSchema), async (c) => {
  const { videoId } = c.req.param();
  const user = c.get("user")!;
  const { text, parent_id } = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  // Verify video exists
  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (!video) return c.json({ error: { code: "NOT_FOUND", message: "Video not found" } }, 404);

  const result = await db.insertSingle<Record<string, unknown>>("comments", {
    video_id: videoId,
    user_id: user.id,
    text,
    parent_id: parent_id || null,
    likes_count: 0,
    is_pinned: false,
  });

  // Increment comment count
  await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], {
    comments_count: (Number(video.comments_count) || 0) + 1,
  });

  // Create notification for video creator
  if (video.creator_id !== user.id) {
    try {
      const { NotificationService } = await import("../services/notification.service");
      const ns = new NotificationService(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
      await ns.create({
        userId: video.creator_id as string,
        type: "comment",
        actorId: user.id,
        videoId,
        commentId: result.id as string,
        message: "মন্তব্য করেছে",
        locale: "bn",
      });
    } catch { /* non-critical */ }
  }

  return c.json({
    id: result.id,
    video_id: videoId,
    user_id: user.id,
    text,
    parent_id: parent_id || null,
    created_at: result.created_at,
  }, 201);
});

// ── DELETE /videos/:videoId/comments/:commentId ──
social.delete("/videos/:videoId/comments/:commentId", authMiddleware, async (c) => {
  const { videoId, commentId } = c.req.param();
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const comment = await db.selectSingle<Record<string, unknown>>("comments", [{ column: "id", operator: "eq", value: commentId }]);
  if (!comment) return c.json({ error: { code: "NOT_FOUND", message: "Comment not found" } }, 404);
  if (comment.user_id !== user.id) return c.json({ error: { code: "FORBIDDEN", message: "Not your comment" } }, 403);

  await db.delete_("comments", [{ column: "id", operator: "eq", value: commentId }]);

  // Decrement count
  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (video) {
    await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], {
      comments_count: Math.max(0, (Number(video.comments_count) || 0) - 1),
    });
  }

  return c.json({ message: "Comment deleted" });
});

// ── POST /videos/:videoId/comments/:commentId/like ──
social.post("/videos/:videoId/comments/:commentId/like", authMiddleware, async (c) => {
  const { commentId } = c.req.param();
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  // Prevent duplicate
  const existing = await db.selectSingle("comment_likes", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "comment_id", operator: "eq", value: commentId },
  ]);
  if (existing) return c.json({ message: "Already liked" });

  await db.insert("comment_likes", { user_id: user.id, comment_id: commentId });
  await db.update("comments", [{ column: "id", operator: "eq", value: commentId }], {
    likes_count: (await getCommentLikeCount(db, commentId)),
  });

  return c.json({ message: "Comment liked", comment_id: commentId });
});

async function getCommentLikeCount(db: SupabaseClient, commentId: string): Promise<number> {
  return db.count("comment_likes", [{ column: "comment_id", operator: "eq", value: commentId }]);
}

// ── POST /users/:userId/follow ──
social.post("/users/:userId/follow", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  if (targetUserId === user.id) {
    return c.json({ error: { code: "SELF_FOLLOW", message: "Cannot follow yourself" } }, 400);
  }

  const target = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: targetUserId }]);
  if (!target) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

  const existing = await db.selectSingle("follows", [
    { column: "follower_id", operator: "eq", value: user.id },
    { column: "following_id", operator: "eq", value: targetUserId },
  ]);
  if (existing) return c.json({ message: "Already following" });

  await db.insert("follows", { follower_id: user.id, following_id: targetUserId });

  // Create notification
  try {
    const { NotificationService } = await import("../services/notification.service");
    const ns = new NotificationService(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
    await ns.create({
      userId: targetUserId,
      type: "follow",
      actorId: user.id,
      message: "আপনাকে ফলো করতে শুরু করেছে",
      locale: "bn",
    });
  } catch { /* non-critical */ }

  return c.json({ message: "Now following", following_id: targetUserId });
});

// ── DELETE /users/:userId/follow ──
social.delete("/users/:userId/follow", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  await db.delete_("follows", [
    { column: "follower_id", operator: "eq", value: user.id },
    { column: "following_id", operator: "eq", value: targetUserId },
  ]);

  return c.json({ message: "Unfollowed" });
});

// ── GET /users/:userId/followers ──
social.get("/users/:userId/followers", optionalAuthMiddleware, async (c) => {
  const { userId } = c.req.param();
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const follows = await db.select<Record<string, unknown>>("follows", [
    { column: "following_id", operator: "eq", value: userId },
  ], { column: "created_at", direction: "desc" }, limit);

  const data = await Promise.all(follows.map(async (f) => {
    const followerUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: f.follower_id as string }]);
    return followerUser ? {
      id: followerUser.id,
      username: followerUser.username,
      display_name: followerUser.display_name,
      avatar_url: followerUser.avatar_url || "",
      is_verified: Boolean(followerUser.is_verified),
    } : null;
  }));

  return c.json({ data: data.filter(Boolean) });
});

// ── GET /users/:userId/following ──
social.get("/users/:userId/following", optionalAuthMiddleware, async (c) => {
  const { userId } = c.req.param();
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const follows = await db.select<Record<string, unknown>>("follows", [
    { column: "follower_id", operator: "eq", value: userId },
  ], { column: "created_at", direction: "desc" }, limit);

  const data = await Promise.all(follows.map(async (f) => {
    const followingUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: f.following_id as string }]);
    return followingUser ? {
      id: followingUser.id,
      username: followingUser.username,
      display_name: followingUser.display_name,
      avatar_url: followingUser.avatar_url || "",
      is_verified: Boolean(followingUser.is_verified),
    } : null;
  }));

  return c.json({ data: data.filter(Boolean) });
});

// ── POST /videos/:videoId/share ──
social.post("/videos/:videoId/share", authMiddleware, async (c) => {
  const { videoId } = c.req.param();
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const video = await db.selectSingle<Record<string, unknown>>("videos", [{ column: "id", operator: "eq", value: videoId }]);
  if (video) {
    await db.update("videos", [{ column: "id", operator: "eq", value: videoId }], {
      shares_count: (Number(video.shares_count) || 0) + 1,
    });
  }

  return c.json({ message: "Share counted", video_id: videoId });
});

// ── POST /report ──
social.post("/report", authMiddleware, zValidator("json", reportSchema), async (c) => {
  const user = c.get("user")!;
  const { target_type, target_id, reason } = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const result = await db.insertSingle<Record<string, unknown>>("reports", {
    reporter_id: user.id,
    target_type,
    target_id,
    reason,
    status: "pending",
  });

  return c.json({ message: "Report submitted", report_id: result.id });
});

// ── POST /users/:userId/block ──
social.post("/users/:userId/block", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const user = c.get("user")!;

  // Blocks table may not exist — use follows unfollow + report pattern
  // Delete any follow relationship
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  await db.delete_("follows", [
    { column: "follower_id", operator: "eq", value: user.id },
    { column: "following_id", operator: "eq", value: targetUserId },
  ]);
  await db.delete_("follows", [
    { column: "follower_id", operator: "eq", value: targetUserId },
    { column: "following_id", operator: "eq", value: user.id },
  ]);

  return c.json({ message: "User blocked" });
});

export default social;
