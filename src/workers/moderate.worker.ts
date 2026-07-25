import { ModerationService } from "../services/moderation.service";

export async function handleModerateJob(job: { data: { videoId: string; r2Key: string } }, env: Record<string, unknown>) {
  const { videoId, r2Key } = job.data;
  console.log(`[ModerateWorker] Moderating video ${videoId} (${r2Key})`);

  try {
    const moderation = new ModerationService(env as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });
    const result = await moderation.moderateVideo(videoId, r2Key);
    await moderation.applyModerationResult(videoId, result.isFlagged, result.categories);

    if (result.isFlagged) {
      console.log(`[ModerateWorker] Video ${videoId} flagged: ${result.categories.join(", ")}`);
    } else {
      console.log(`[ModerateWorker] Video ${videoId} passed moderation`);
    }

    return result;
  } catch (err) {
    console.error(`[ModerateWorker] Error: ${err}`);
    throw err;
  }
}
