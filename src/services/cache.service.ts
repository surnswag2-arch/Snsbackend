// Upstash Redis wrapper for caching, counters, rate limiting, and pub/sub
// Uses HTTP-based Upstash Redis (works from Cloudflare Workers without TCP)

export class CacheService {
  private url: string;
  private token: string;

  constructor(env: { UPSTASH_REDIS_URL: string; UPSTASH_REDIS_TOKEN: string }) {
    this.url = env.UPSTASH_REDIS_URL;
    this.token = env.UPSTASH_REDIS_TOKEN;
  }

  private async command(cmd: string, ...args: unknown[]): Promise<unknown> {
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

  // ── Generic get/set ──
  async get<T>(key: string): Promise<T | null> {
    const result = await this.command("get", key);
    return result ? JSON.parse(result as string) as T : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.command("setex", key, ttlSeconds, serialized);
    } else {
      await this.command("set", key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.command("del", key);
  }

  // ── Cache-aside helper ──
  async getOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetcher();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  // ── Counters ──
  async increment(key: string, by = 1): Promise<number> {
    return (await this.command("incrby", key, by)) as number;
  }

  async getCounter(key: string): Promise<number> {
    const val = await this.command("get", key);
    return (val as number) || 0;
  }

  // ── Rate limiting ──
  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;

    const count = await this.increment(windowKey);
    // Set expiry on first increment
    if (count === 1) {
      await this.command("expire", windowKey, Math.ceil(windowMs / 1000));
    }

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetMs: windowMs - (now % windowMs),
    };
  }

  // ── Feed caching ──
  async cacheFeed(userId: string, feedType: "foryou" | "following", data: unknown): Promise<void> {
    const key = `feed:${feedType}:${userId}`;
    await this.set(key, data, 60); // 60s TTL for feed
  }

  async getCachedFeed(userId: string, feedType: "foryou" | "following"): Promise<unknown | null> {
    const key = `feed:${feedType}:${userId}`;
    return this.get(key);
  }

  // ── Like buffering ──
  async bufferLike(videoId: string): Promise<number> {
    return this.increment(`likes:buffer:${videoId}`);
  }

  async bufferUnlike(videoId: string): Promise<number> {
    return this.increment(`likes:buffer:${videoId}`, -1);
  }

  async getLikeBuffer(videoId: string): Promise<number> {
    return this.getCounter(`likes:buffer:${videoId}`);
  }

  async flushLikes(videoId: string): Promise<number> {
    const buffered = await this.getLikeBuffer(videoId);
    if (buffered !== 0) {
      await this.del(`likes:buffer:${videoId}`);
    }
    return buffered;
  }
}
