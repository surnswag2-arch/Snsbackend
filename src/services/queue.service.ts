// Queue service using BullMQ via Upstash Redis
// For Cloudflare Workers: jobs are dispatched via REST to Redis,
// and workers can run as separate Worker scripts or via Cron Triggers.

export enum QueueJobType {
  TRANSCODE_VIDEO = "transcode_video",
  NOTIFY_FOLLOWERS = "notify_followers",
  MODERATE_VIDEO = "moderate_video",
  FLUSH_LIKES = "flush_likes",
  INDEX_SEARCH = "index_search",
  SEND_EMAIL = "send_email",
  PROCESS_PAYOUT = "process_payout",
}

interface QueueJob {
  type: QueueJobType;
  data: Record<string, unknown>;
  delay?: number; // ms
  idempotencyKey?: string;
}

export class QueueService {
  private url: string;
  private token: string;
  private queuePrefix: string;

  constructor(env: { UPSTASH_REDIS_URL: string; UPSTASH_REDIS_TOKEN: string }) {
    this.url = env.UPSTASH_REDIS_URL;
    this.token = env.UPSTASH_REDIS_TOKEN;
    this.queuePrefix = "sur-swag:queue:";
  }

  private async redisCommand(cmd: string, ...args: unknown[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cmd, args }),
    });
    if (!response.ok) throw new Error(`Redis command failed: ${cmd}`);
    return response.json();
  }

  // Push a job to the queue
  async enqueue(job: QueueJob): Promise<void> {
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      type: job.type,
      data: job.data,
      timestamp: Date.now(),
      idempotencyKey: job.idempotencyKey,
      attempts: 0,
      maxAttempts: 3,
    });

    // Use a Redis list as a simple queue
    // In production, use BullMQ's z-add for delayed jobs
    if (job.delay && job.delay > 0) {
      const score = Date.now() + job.delay;
      await this.redisCommand("zadd", `${this.queuePrefix}delayed`, score, payload);
    } else {
      await this.redisCommand("lpush", `${this.queuePrefix}default`, payload);
    }
  }

  // Pop the next available job (called by worker)
  async dequeue(): Promise<QueueJob | null> {
    const result = await this.redisCommand("rpop", `${this.queuePrefix}default`);
    if (!result) return null;
    return JSON.parse(result as string);
  }

  // Check the queue length
  async queueLength(): Promise<number> {
    const result = await this.redisCommand("llen", `${this.queuePrefix}default`);
    return (result as number) || 0;
  }

  // Convenience methods for common job types

  async enqueueTranscode(r2Key: string, videoId: string): Promise<void> {
    await this.enqueue({
      type: QueueJobType.TRANSCODE_VIDEO,
      data: { r2Key, videoId },
      idempotencyKey: `transcode:${videoId}`,
    });
  }

  async enqueueNotification(
    userIds: string[],
    type: string,
    actorId: string,
    videoId?: string,
  ): Promise<void> {
    // Fan-out: enqueue one job per user — in production batch this
    for (const userId of userIds) {
      await this.enqueue({
        type: QueueJobType.NOTIFY_FOLLOWERS,
        data: { userId, type, actorId, videoId },
      });
    }
  }

  async enqueueModeration(videoId: string, r2Key: string): Promise<void> {
    await this.enqueue({
      type: QueueJobType.MODERATE_VIDEO,
      data: { videoId, r2Key },
      idempotencyKey: `moderate:${videoId}`,
    });
  }

  async enqueueFlushLikes(videoId: string): Promise<void> {
    await this.enqueue({
      type: QueueJobType.FLUSH_LIKES,
      data: { videoId },
      idempotencyKey: `flush-likes:${videoId}`,
      delay: 5000, // 5s delay to batch
    });
  }
}
