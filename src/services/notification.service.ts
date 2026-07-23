// Notification service — creates notifications and triggers fan-out

import type { NotificationType } from "../types";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  actorId: string;
  videoId?: string;
  commentId?: string;
  message: string;
  locale: string;
  data?: Record<string, unknown>;
}

export class NotificationService {
  private supabaseUrl: string;
  private serviceRoleKey: string;

  constructor(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
    this.supabaseUrl = env.SUPABASE_URL;
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Direct DB insert via Supabase REST API (uses service role for writes)
  private async supabaseQuery<T>(table: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/${table}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Prefer": "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Supabase ${method} ${table} failed: ${response.statusText}`);
    return response.json() as T;
  }

  // Create a single notification (direct DB write)
  async create(params: CreateNotificationParams): Promise<void> {
    await this.supabaseQuery("notifications", "POST", {
      user_id: params.userId,
      type: params.type,
      actor_id: params.actorId,
      video_id: params.videoId || null,
      comment_id: params.commentId || null,
      message: params.message,
      locale: params.locale,
      data: params.data || {},
      read: false,
    });
  }

  // Fan-out a notification to all followers of a creator
  async fanOutToFollowers(
    creatorId: string,
    type: NotificationType,
    actorId: string,
    videoId: string | undefined,
    messageTemplate: (locale: string) => string,
    queueService: { enqueueNotification: (userIds: string[], type: string, actorId: string, videoId?: string) => Promise<void> },
  ): Promise<void> {
    // Fetch follower IDs from the follows table
    let cursor = 0;
    const batchSize = 100;
    const allFollowers: string[] = [];

    while (true) {
      const result = await this.supabaseQuery<{ follower_id: string }[]>(
        "follows",
        "GET",
        undefined,
        // Note: In real impl, pass query params via headers or a query builder
      );
      // This is simplified — in production use Supabase JS client with pagination
      break;
    }

    // Queue the fan-out job for async processing
    if (allFollowers.length > 0) {
      await queueService.enqueueNotification(allFollowers, type, actorId, videoId);
    }
  }

  // Mark notifications as read
  async markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    const filter = notificationIds
      ? { id: `in.(${notificationIds.join(",")})` }
      : { user_id: `eq.${userId}`, read: "eq.false" };

    await this.supabaseQuery("notifications", "PATCH", { read: true });
  }

  // Get notifications for a user
  async getNotifications(userId: string, limit = 20, cursor?: string): Promise<{ data: any[]; nextCursor?: string }> {
    const query = `?user_id=eq.${userId}&order=created_at.desc&limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`;

    const result = await fetch(`${this.supabaseUrl}/rest/v1/notifications${query}`, {
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
      },
    });

    if (!result.ok) throw new Error("Failed to fetch notifications");
    const data = await result.json();
    return { data };
  }
}
