import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { createVideoSchema, requestUploadSchema } from "../db/schema";
import { SupabaseClient } from "../db/client";

const upload = new Hono<{ Variables: Variables }>();

// ── POST /upload/request ──
upload.post("/request", authMiddleware, zValidator("json", requestUploadSchema), async (c) => {
  const user = c.get("user")!;
  const { filename } = c.req.valid("json");

  const videoId = crypto.randomUUID();
  const key = `uploads/${user.id}/${videoId}_${filename}`;

  // Generate R2 presigned upload URL
  const r2 = c.env.R2_UPLOADS as { createSignedUrl: (key: string, opts?: { method?: string; expirySeconds?: number }) => Promise<string> };
  const presignedUrl = await r2.createSignedUrl(key, { method: "PUT", expirySeconds: 3600 });

  return c.json({
    videoId,
    uploadUrl: presignedUrl,
    r2Key: key,
    expiresIn: 3600,
  }, 201);
});

// ── POST /upload/callback ──
upload.post("/callback", zValidator("json", z.object({
  r2_key: z.string(),
  stream_uid: z.string().optional(),
  status: z.enum(["processing", "ready", "failed"]),
  video_id: z.string().uuid(),
})), async (c) => {
  const { stream_uid, status, video_id } = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const updateData: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (stream_uid) updateData.stream_uid = stream_uid;

  await db.update("videos", [{ column: "id", operator: "eq", value: video_id }], updateData);

  return c.json({ message: "Upload callback received", videoId: video_id, status });
});

// ── POST /upload/create-video ──
upload.post("/create-video", authMiddleware, zValidator("json", createVideoSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");
  const db = new SupabaseClient(c.env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

  const videoId = crypto.randomUUID();

  await db.insert("videos", {
    id: videoId,
    creator_id: user.id,
    caption: body.caption || "",
    hashtags: body.hashtags || [],
    sound_id: body.sound_id || null,
    status: "processing",
    r2_key: body.r2_key,
    thumbnail_url: "",
    duration: 0,
    width: 0,
    height: 0,
    privacy: body.privacy || "public",
    allow_comments: body.allow_comments ?? true,
    allow_duet: body.allow_duet ?? true,
    allow_stitch: body.allow_stitch ?? true,
    allow_download: body.allow_download ?? true,
    locale: body.locale || "bn",
    likes_count: 0,
    comments_count: 0,
    shares_count: 0,
    views_count: 0,
  });

  // Enqueue transcode job
  try {
    const { QueueService } = await import("../services/queue.service");
    const queue = new QueueService(c.env as { UPSTASH_REDIS_URL: string; UPSTASH_REDIS_TOKEN: string });
    await queue.enqueueTranscode(body.r2_key, videoId);
  } catch { /* queue non-critical */ }

  // Index in search
  try {
    const { SearchService } = await import("../services/search.service");
    const ss = new SearchService(c.env as { MEILISEARCH_URL: string; MEILISEARCH_API_KEY: string });
    await ss.ensureIndex("videos");
    await ss.indexDocuments("videos", [{
      id: videoId,
      caption: body.caption || "",
      hashtags: body.hashtags || [],
      creator_id: user.id,
      created_at: new Date().toISOString(),
    }]);
  } catch { /* search indexing non-critical */ }

  return c.json({
    id: videoId,
    creator_id: user.id,
    status: "processing",
    ...body,
  }, 201);
});

export default upload;
