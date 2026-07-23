// Queue worker: runs AI moderation on uploaded videos

export async function handleModerateJob(job: {
  data: { videoId: string; r2Key: string };
}, env: any) {
  const { videoId, r2Key } = job.data;

  console.log(`[ModerateWorker] Moderating video ${videoId}`);

  // In production:
  // 1. Download video or send URL to moderation API
  //    (Sightengine, Azure Content Safety, AWS Rekognition, etc.)
  //
  // 2. Parse results — check for:
  //    - Nudity/sexual content
  //    - Violence
  //    - Hate speech (Bengali + English)
  //    - Copyrighted music detection
  //
  // 3. Return isFlagged + categories + confidence

  // Stub: always pass
  const isFlagged = false;
  const confidence = 0.98;
  const categories: string[] = [];

  // Update video status
  const status = isFlagged ? "flagged" : "ready";
  await fetch(`${env.SUPABASE_URL}/rest/v1/videos?id=eq.${videoId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      status,
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`[ModerateWorker] Video ${videoId}: status=${status}, confidence=${confidence}`);

  return { success: true, isFlagged, confidence, categories };
}
