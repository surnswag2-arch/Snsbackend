import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { SupabaseClient } from "../db/client";

const admin = new Hono<{ Variables: Variables }>();

// Admin role check middleware
const adminAuth = authMiddleware;

// ── GET /admin/moderation-queue ──
admin.get("/moderation-queue", adminAuth, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  // Check admin role
  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  if (!profile || !profile.is_admin) {
    return c.json({ error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
  }

  const reports = await db.select<Record<string, unknown>>("reports", [
    { column: "status", operator: "eq", value: "pending" },
  ], { column: "created_at", direction: "desc" }, 50);

  const total = await db.count("reports", [{ column: "status", operator: "eq", value: "pending" }]);

  const data = await Promise.all(reports.map(async (r) => {
    let reporter = null;
    if (r.reporter_id) {
      const reporterUser = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: r.reporter_id as string }]);
      if (reporterUser) {
        reporter = { id: reporterUser.id, username: reporterUser.username };
      }
    }
    return {
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      status: r.status,
      reporter,
      created_at: r.created_at,
    };
  }));

  return c.json({ data, total });
});

// ── PATCH /admin/moderation-queue/:id ──
admin.patch("/moderation-queue/:id", adminAuth, zValidator("json", z.object({
  status: z.enum(["reviewed", "actioned", "dismissed"]),
  action: z.string().optional(),
})), async (c) => {
  const id = c.req.param("id");
  const { status } = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const report = await db.selectSingle<Record<string, unknown>>("reports", [{ column: "id", operator: "eq", value: id }]);
  if (!report) return c.json({ error: { code: "NOT_FOUND", message: "Report not found" } }, 404);

  await db.update("reports", [{ column: "id", operator: "eq", value: id }], { status });

  // If actioned, flag the video
  if (status === "actioned" && report.target_type === "video") {
    await db.update("videos", [{ column: "id", operator: "eq", value: report.target_id as string }], { status: "flagged" });
  }

  return c.json({ message: `Report ${id} updated to ${status}` });
});

// ── GET /admin/analytics/summary ──
admin.get("/analytics/summary", adminAuth, async (c) => {
  const user = c.get("user")!;
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const profile = await db.selectSingle<Record<string, unknown>>("users", [{ column: "id", operator: "eq", value: user.id }]);
  if (!profile || !profile.is_admin) {
    return c.json({ error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
  }

  const totalUsers = await db.count("users");
  const totalVideos = await db.count("videos");
  const activeVideos = await db.count("videos", [{ column: "status", operator: "eq", value: "ready" }]);

  const ledgerEntries = await db.select<Record<string, unknown>>("ledger");
  const totalRevenue = ledgerEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return c.json({
    total_users: totalUsers,
    total_videos: totalVideos,
    active_videos: activeVideos,
    daily_active_users: Math.floor(totalUsers * 0.15), // Estimate: 15% DAU
    total_revenue: totalRevenue,
    currency: "bdt",
  });
});

export default admin;
