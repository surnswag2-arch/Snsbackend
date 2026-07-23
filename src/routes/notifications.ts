import { Hono } from "hono";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";

const notifications = new Hono<{ Variables: Variables }>();

// ── GET /notifications ──
notifications.get("/", authMiddleware, async (c) => {
  const user = c.get("user")!;

  // In production: fetch from notifications table with pagination
  // Ordered by created_at DESC, filtered by user_id

  return c.json({
    data: [
      {
        id: crypto.randomUUID(),
        type: "like",
        actor: { id: crypto.randomUUID(), username: "riya_akter", avatar_url: "" },
        message: "আপনার ভিডিও পছন্দ করেছে",
        video_id: crypto.randomUUID(),
        read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        type: "follow",
        actor: { id: crypto.randomUUID(), username: "sami_khan", avatar_url: "" },
        message: "আপনাকে ফলো করতে শুরু করেছে",
        read: false,
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ],
    unread_count: 2,
  });
});

// ── PATCH /notifications/read ──
notifications.patch("/read", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const ids = body.ids as string[] | undefined;

  // In production: update notifications SET read = true WHERE user_id = user.id
  // If ids provided, only mark those specific ones

  return c.json({ message: "Notifications marked as read" });
});

// ── GET /notifications/unread-count ──
notifications.get("/unread-count", authMiddleware, async (c) => {
  const user = c.get("user")!;

  // In production: SELECT COUNT(*) FROM notifications WHERE user_id = user.id AND read = false

  return c.json({ unread_count: 2 });
});

export default notifications;
