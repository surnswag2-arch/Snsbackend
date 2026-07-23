// Moderation service — AI content flagging stub + report system

export class ModerationService {
  private supabaseUrl: string;
  private serviceRoleKey: string;

  constructor(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
    this.supabaseUrl = env.SUPABASE_URL;
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Run automated moderation on a video (AI API call)
  async moderateVideo(videoId: string, r2Key: string): Promise<{
    isFlagged: boolean;
    confidence: number;
    categories: string[];
  }> {
    // In production: call a third-party moderation API (e.g., Sightengine, Azure Content Safety)
    // or a self-hosted model endpoint with the video URL.

    console.log(`[Moderation] Checking video ${videoId} (${r2Key})`);

    // Stub: always return clean for now
    return {
      isFlagged: false,
      confidence: 0.99,
      categories: [],
    };
  }

  // Update video status based on moderation result
  async applyModerationResult(
    videoId: string,
    isFlagged: boolean,
    categories: string[],
  ): Promise<void> {
    const status = isFlagged ? "flagged" : "ready";

    await fetch(`${this.supabaseUrl}/rest/v1/videos?id=eq.${videoId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
      }),
    });

    if (isFlagged) {
      console.log(`[Moderation] Video ${videoId} flagged for: ${categories.join(", ")}`);
    }
  }

  // Report a video/user/comment
  async createReport(reporterId: string, targetType: string, targetId: string, reason: string): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify({
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
        status: "pending",
      }),
    });
  }
}
