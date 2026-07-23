import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Variables } from "../config";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
import { createCommentSchema, reportSchema } from "../db/schema";

const social = new Hono<{ Variables: Variables }>();

// ── Comment CRUD ──

// GET /videos/:videoId/comments
social.get("/videos/:videoId/comments", optionalAuthMiddleware, async (c) => {
  const { videoId } = c.req.param();

  // In production: fetch from Postgres with parent_id IS NULL for top-level,
  // then fetch replies separately

  const mockComments = [
    {
      id: crypto.randomUUID(),
      video_id: videoId,
      parent_id: null,
      user: { id: crypto.randomUUID(), username: "user1", avatar_url: "" },
      text: "দারুণ ভিডিও! 🔥",
      likes_count: 124,
      is_pinned: true,
      replies: [
        {
          id: crypto.randomUUID(),
          user: { id: crypto.randomUUID(), username: "creator", avatar_url: "" },
          text: "ধন্যবাদ! 🙌",
          likes_count: 23,
        },
      ],
      created_at: new Date().toISOString(),
    },
  ];

  return c.json({ data: mockComments });
});

// POST /videos/:videoId/comments
social.post("/videos/:videoId/comments", authMiddleware, zValidator("json", createCommentSchema), async (c) => {
  const { videoId } = c.req.param();
  const user = c.get("user")!;
  const { text, parent_id } = c.req.valid("json");

  // In production: insert into Postgres + increment video.comments_count
  // + create notification for video creator

  return c.json({
    id: crypto.randomUUID(),
    video_id: videoId,
    user_id: user.id,
    text,
    parent_id: parent_id || null,
    created_at: new Date().toISOString(),
  }, 201);
});

// DELETE /videos/:videoId/comments/:commentId
social.delete("/videos/:videoId/comments/:commentId", authMiddleware, async (c) => {
  const { videoId, commentId } = c.req.param();
  const user = c.get("user")!;

  // In production: check ownership, soft-delete

  return c.json({ message: "Comment deleted" });
});

// POST /videos/:videoId/comments/:commentId/like
social.post("/videos/:videoId/comments/:commentId/like", authMiddleware, async (c) => {
  const { commentId } = c.req.param();

  return c.json({ message: "Comment liked", comment_id: commentId });
});

// ── Follow/Unfollow ──

// POST /users/:userId/follow
social.post("/users/:userId/follow", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");
  const user = c.get("user")!;

  if (targetUserId === user.id) {
    return c.json({ error: { code: "SELF_FOLLOW", message: "Cannot follow yourself" } }, 400);
  }

  // In production: insert into follows table + trigger notification
  // + increment follower/following counts (via DB trigger)

  return c.json({ message: "Now following", following_id: targetUserId });
});

// DELETE /users/:userId/follow
social.delete("/users/:userId/follow", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");

  // In production: delete from follows table

  return c.json({ message: "Unfollowed" });
});

// GET /users/:userId/followers
social.get("/users/:userId/followers", optionalAuthMiddleware, async (c) => {
  const { userId } = c.req.param();

  return c.json({
    data: [
      { id: crypto.randomUUID(), username: "follower1", avatar_url: "" },
      { id: crypto.randomUUID(), username: "follower2", avatar_url: "" },
    ],
  });
});

// GET /users/:userId/following
social.get("/users/:userId/following", optionalAuthMiddleware, async (c) => {
  const { userId } = c.req.param();

  return c.json({
    data: [
      { id: crypto.randomUUID(), username: "following1", avatar_url: "" },
    ],
  });
});

// ── Share ──

// POST /videos/:videoId/share
social.post("/videos/:videoId/share", authMiddleware, async (c) => {
  const { videoId } = c.req.param();

  // In production: increment video.shares_count

  return c.json({ message: "Share counted", video_id: videoId });
});

// ── Report ──

// POST /report
social.post("/report", authMiddleware, zValidator("json", reportSchema), async (c) => {
  const user = c.get("user")!;
  const { target_type, target_id, reason } = c.req.valid("json");

  // In production: insert into reports table + trigger moderation queue

  return c.json({
    message: "Report submitted",
    report_id: crypto.randomUUID(),
  });
});

// ── Block user ──

// POST /users/:userId/block
social.post("/users/:userId/block", authMiddleware, async (c) => {
  const targetUserId = c.req.param("userId");

  // In production: insert into blocks table

  return c.json({ message: "User blocked" });
});

export default social;
