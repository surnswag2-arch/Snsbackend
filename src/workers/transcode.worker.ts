export async function handleTranscodeJob(job: { data: { r2Key: string; videoId: string } }, env: Record<string, unknown>) {
  const { r2Key, videoId } = job.data;
  console.log(`[TranscodeWorker] Starting transcode for video ${videoId} (${r2Key})`);

  const accountId = env.CLOUDFLARE_ACCOUNT_ID as string;
  const streamToken = env.CLOUDFLARE_STREAM_TOKEN as string;
  const supabaseUrl = env.SUPABASE_URL as string;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY as string;

  try {
    // Step 1: Copy from R2 to Cloudflare Stream
    const copyRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${streamToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { file: { type: "r2", bucket: "sur-swag-raw-uploads", key: r2Key } },
          requireSignedURLs: true,
        }),
      },
    );

    if (!copyRes.ok) throw new Error(`Stream copy failed: ${copyRes.statusText}`);
    const copyData = (await copyRes.json()) as { result?: { uid: string; thumbnail?: string; status?: { state?: string } }; success: boolean };
    const streamUid = copyData.result?.uid;
    if (!streamUid) throw new Error("No stream UID returned");

    console.log(`[TranscodeWorker] Video ${videoId} → Stream UID: ${streamUid}`);

    // Step 2: Poll for readiness (simplified — in production use webhooks)
    let isReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
        { headers: { Authorization: `Bearer ${streamToken}` } },
      );
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { result?: { status?: { state?: string }; thumbnail?: string } };
        if (statusData.result?.status?.state === "ready") {
          isReady = true;
          const thumbnail = statusData.result.thumbnail || "";

          // Update video record
          await fetch(`${supabaseUrl}/rest/v1/videos?id=eq.${videoId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              stream_uid: streamUid,
              thumbnail_url: thumbnail,
              status: "ready",
              updated_at: new Date().toISOString(),
            }),
          });
          break;
        }
      }
    }

    if (!isReady) {
      // Mark as failed after timeout
      await fetch(`${supabaseUrl}/rest/v1/videos?id=eq.${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ status: "failed", updated_at: new Date().toISOString() }),
      });
      throw new Error("Transcoding timed out");
    }

    return { success: true, streamUid };
  } catch (err) {
    console.error(`[TranscodeWorker] Error: ${err}`);
    // Mark as failed
    await fetch(`${supabaseUrl}/rest/v1/videos?id=eq.${videoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ status: "failed", updated_at: new Date().toISOString() }),
    }).catch(() => {});
    throw err;
  }
}
