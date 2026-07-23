import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { authMiddleware } from "../middleware/auth";
import { createVideoSchema, requestUploadSchema } from "../db/schema";

const upload = new Hono<{ Variables: Variables }>();

// ── POST /upload/request ──
// Returns a presigned URL for the client to upload directly to R2
upload.post("/request", authMiddleware, zValidator("json", requestUploadSchema), async (c) => {
  const user = c.get("user")!;
  const { filename, content_type } = c.req.valid("json");

  const videoId = crypto.randomUUID();
  const key = `uploads/${user.id}/${videoId}_${filename}`;

  // In production: generate an R2 presigned upload URL
  // const presignedUrl = await c.env.R2_UPLOADS.createPresignedUrl({
  //   key,
  //   method: "PUT",
  //   expirySeconds: 3600,
  // });

  const presignedUrl = `https://r2.example.com/${key}?presigned=mock`;

  return c.json({
    videoId,
    uploadUrl: presignedUrl,
    r2Key: key,
    expiresIn: 3600,
  }, 201);
});

// ── POST /upload/callback ──
// Called by Cloudflare Stream or a queue worker after transcoding completes
upload.post("/callback", zValidator("json", z.object({
  r2_key: z.string(),
  stream_uid: z.string().optional(),
  status: z.enum(["processing", "ready", "failed"]),
  video_id: z.string().uuid(),
})), async (c) => {
  const { r2_key, stream_uid, status, video_id } = c.req.valid("json");

  // In production: update video record in Postgres
  // await supabase.from("videos").update({
  //   status,
  //   stream_uid,
  //   updated_at: new Date().toISOString(),
  // }).eq("id", video_id);

  return c.json({
    message: "Upload callback received",
    videoId: video_id,
    status,
  });
});

// ── POST /upload/create-video ──
// After upload completes, create the video record
upload.post("/create-video", authMiddleware, zValidator("json", createVideoSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");

  // In production: insert video record in Postgres + enqueue transcode job

  const videoId = crypto.randomUUID();

  return c.json({
    id: videoId,
    creator_id: user.id,
    status: "processing",
    ...body,
  }, 201);
});

export default upload;
