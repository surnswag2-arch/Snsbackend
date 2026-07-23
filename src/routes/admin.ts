import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";

const admin = new Hono<{ Variables: Variables }>();

// In production: protect all admin routes with admin role check middleware

// ── GET /admin/moderation-queue ──
admin.get("/moderation-queue", async (c) => {
  // In production: fetch reports + flagged videos, ordered by severity/recency

  return c.json({
    data: [
      {
        id: crypto.randomUUID(),
        target_type: "video",
        target_id: crypto.randomUUID(),
        reason: "Inappropriate content",
        status: "pending",
        reporter: { id: crypto.randomUUID(), username: "reporter1" },
        created_at: new Date().toISOString(),
      },
    ],
    total: 5,
  });
});

// ── PATCH /admin/moderation-queue/:id ──
admin.patch("/moderation-queue/:id", zValidator("json", z.object({
  status: z.enum(["reviewed", "actioned", "dismissed"]),
  action: z.string().optional(),
})), async (c) => {
  const id = c.req.param("id");
  const { status, action } = c.req.valid("json");

  // In production: update report status + optionally take action on target

  return c.json({ message: `Report ${id} updated to ${status}` });
});

// ── GET /admin/analytics/summary ──
admin.get("/analytics/summary", async (c) => {
  // In production: aggregate from analytics events table

  return c.json({
    total_users: 15000000,
    total_videos: 45000000,
    daily_active_users: 3500000,
    total_revenue: 12500000,
    currency: "bdt",
  });
});

export default admin;
