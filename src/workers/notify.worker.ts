import type { NotificationType } from "../types";

export async function handleNotifyJob(
  job: { data: { userId: string; type: string; actorId: string; videoId?: string; commentId?: string; message?: string } },
  env: Record<string, unknown>,
) {
  const { userId, type, actorId, videoId, commentId, message } = job.data;
  console.log(`[NotifyWorker] Sending ${type} notification to user ${userId}`);

  const supabaseUrl = env.SUPABASE_URL as string;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY as string;

  // First check: does the user exist?
  try {
    const userRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,locale`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!userRes.ok || (await userRes.json() as unknown[]).length === 0) {
      console.log(`[NotifyWorker] User ${userId} not found, skipping`);
      return { skipped: true };
    }
  } catch {
    return { skipped: true };
  }

  const defaultMessages: Partial<Record<NotificationType, string>> = {
    like: "আপনার ভিডিও পছন্দ করেছে",
    comment: "আপনার ভিডিওতে মন্তব্য করেছে",
    follow: "আপনাকে ফলো করতে শুরু করেছে",
    mention: "আপনাকে উল্লেখ করেছে",
    milestone: "মাইলস্টোন অর্জিত!",
  };

  const notificationMessage = message || defaultMessages[type as NotificationType] || "নতুন নোটিফিকেশন";

  // Insert notification
  try {
    await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        type,
        actor_id: actorId,
        video_id: videoId || null,
        comment_id: commentId || null,
        message: notificationMessage,
        locale: "bn",
        data: { videoId: videoId || null, commentId: commentId || null },
        read: false,
      }),
    });
  } catch (err) {
    console.error(`[NotifyWorker] Failed to insert notification: ${err}`);
  }

  // In production: push via WebSocket if user is connected to a Durable Object
  // This would require a DO namespace lookup

  return { success: true };
}
