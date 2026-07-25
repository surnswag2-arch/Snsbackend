import { Hono } from "hono";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { SupabaseClient, type QueryFilter } from "../db/client";

const notifications = new Hono<{ Variables: Variables }>();

// ── GET /notifications ──
notifications.get("/", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);

  const filters: QueryFilter[] = [{ column: "user_id", operator: "eq", value: user.id }];
  if (cursor) filters.push({ column: "created_at", operator: "lt", value: cursor });

  const rows = await db.select<Record<string, unknown>>("notifications", filters, { column: "created_at", direction: "desc" }, limit);
  const unreadCount = await db.count("notifications", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "read", operator: "eq", value: "false" },
  ]);

  const data = await Promise.all(rows.map(async (row) => {
    let actor = null;
    if (row.actor_id) {
      const actorUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: row.actor_id as string }]);
      if (actorUser) {
        actor = {
          id: actorUser.id,
          username: actorUser.username,
          display_name: actorUser.display_name,
          avatar_url: actorUser.avatar_url || "",
          is_verified: Boolean(actorUser.is_verified),
        };
      }
    }
    return {
      id: row.id,
      type: row.type,
      actor_id: row.actor_id,
      video_id: row.video_id,
      comment_id: row.comment_id,
      message: row.message,
      read: Boolean(row.read),
      created_at: row.created_at,
      actor,
    };
  }));

  return c.json({
    data,
    unread_count: unreadCount,
    nextCursor: rows.length === limit ? rows[rows.length - 1]?.created_at : undefined,
  });
});

// ── PATCH /notifications/read ──
notifications.patch("/read", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

  if (Array.isArray(body.ids) && (body.ids as string[]).length > 0) {
    for (const id of body.ids as string[]) {
      await db.update("notifications", [
        { column: "id", operator: "eq", value: id },
        { column: "user_id", operator: "eq", value: user.id },
      ], { read: true });
    }
  } else {
    await db.update("notifications", [
      { column: "user_id", operator: "eq", value: user.id },
      { column: "read", operator: "eq", value: "false" },
    ], { read: true });
  }

  return c.json({ message: "Notifications marked as read" });
});

// ── GET /notifications/unread-count ──
notifications.get("/unread-count", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const unreadCount = await db.count("notifications", [
    { column: "user_id", operator: "eq", value: user.id },
    { column: "read", operator: "eq", value: "false" },
  ]);

  return c.json({ unread_count: unreadCount });
});

export default notifications;
