// Queue worker: fan-out notifications to followers
// Processes one notification at a time to avoid overwhelming Postgres

export async function handleNotifyJob(job: {
  data: {
    userId: string;
    type: string;
    actorId: string;
    videoId?: string;
    locale?: string;
  };
}, env: any) {
  const { userId, type, actorId, videoId, locale = "bn" } = job.data;

  // Build localized message based on type
  const messages: Record<string, string> = {
    like: "আপনার ভিডিও পছন্দ করেছে",
    comment: "মন্তব্য করেছে",
    follow: "আপনাকে ফলো করতে শুরু করেছে",
    mention: "আপনাকে উল্লেখ করেছে",
  };

  const message = messages[type] || "নতুন নোটিফিকেশন";

  // Insert into notifications table
  await fetch(`${env.SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      type,
      actor_id: actorId,
      video_id: videoId || null,
      message,
      locale,
      read: false,
    }),
  });

  // In production: also push via WebSocket if user is online
  // pushToUser(userId, { type, actorId, message });

  return { success: true, userId };
}
