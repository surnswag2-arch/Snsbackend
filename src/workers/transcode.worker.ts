// Queue worker: handles video transcoding via Cloudflare Stream
// Triggered when a raw upload is complete in R2

export async function handleTranscodeJob(job: { data: { r2Key: string; videoId: string } }, env: any) {
  const { r2Key, videoId } = job.data;
  console.log(`[TranscodeWorker] Starting transcode for video ${videoId} (${r2Key})`);

  // In production:
  // 1. Call Cloudflare Stream API to ingest from R2:
  //    POST https://api.cloudflare.com/client/v4/accounts/{account_id}/stream/copy
  //    { "input": { "file": { "type": "r2", "bucket": "sur-swag-raw-uploads", "key": r2Key } },
  //      "requireSignedURLs": true }
  //
  // 2. Store the stream UID in the videos table
  //
  // 3. Set up webhook to receive transcoding completion notification
  //
  // 4. On completion: update video status to "ready", generate thumbnail

  // Stub: simulate processing
  const streamUid = crypto.randomUUID();
  console.log(`[TranscodeWorker] Video ${videoId} → Stream UID: ${streamUid}`);

  // Update the video record
  await fetch(`${env.SUPABASE_URL}/rest/v1/videos?id=eq.${videoId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      stream_uid: streamUid,
      status: "ready",
      updated_at: new Date().toISOString(),
    }),
  });

  return { success: true, streamUid };
}
