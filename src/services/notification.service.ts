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

  private async supabaseFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase request failed: ${res.statusText}`);
    return res.json() as T;
  }

  async create(params: CreateNotificationParams): Promise<void> {
    await this.supabaseFetch("notifications", {
      method: "POST",
      body: JSON.stringify({
        user_id: params.userId,
        type: params.type,
        actor_id: params.actorId,
        video_id: params.videoId || null,
        comment_id: params.commentId || null,
        message: params.message,
        locale: params.locale,
        data: params.data || {},
        read: false,
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  async fanOutToFollowers(
    creatorId: string,
    type: NotificationType,
    actorId: string,
    videoId: string | undefined,
    _messageTemplate: (locale: string) => string,
    queueService: { enqueueNotification: (userIds: string[], type: string, actorId: string, _videoId?: string) => Promise<void> },
  ): Promise<void> {
    const allFollowers: string[] = [];
    let offset = 0;
    const batchSize = 100;

    while (true) {
      const rows = await this.supabaseFetch<{ follower_id: string }[]>(
        `follows?following_id=eq.${creatorId}&select=follower_id&limit=${batchSize}&offset=${offset}`,
      );
      if (rows.length === 0) break;
      allFollowers.push(...rows.map((r) => r.follower_id));
      offset += rows.length;
      if (rows.length < batchSize) break;
    }

    if (allFollowers.length > 0) {
      await queueService.enqueueNotification(allFollowers, type, actorId, videoId);
    }
  }

  async markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    const filter = notificationIds
      ? `id=in.(${notificationIds.join(",")})`
      : `user_id=eq.${userId}&read=eq.false`;

    await this.supabaseFetch(`notifications?${filter}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
      headers: { Prefer: "return=minimal" },
    });
  }

  async getNotifications(userId: string, limit = 20, cursor?: string): Promise<{ data: Record<string, unknown>[]; nextCursor?: string }> {
    const query = `notifications?user_id=eq.${userId}&order=created_at.desc&limit=${limit}${cursor ? `&created_at=lt.${cursor}` : ""}`;
    const data = await this.supabaseFetch<Record<string, unknown>[]>(query);
    return { data, nextCursor: data.length === limit ? (data[data.length - 1]?.created_at as string | undefined) : undefined };
  }
}
