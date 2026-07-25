import { createMiddleware } from "hono/factory";
import { CacheService } from "../services/cache.service";
import type { Variables } from "../config";

const ENDPOINT_LIMITS: Record<string, { max: number; window: number }> = {
  "POST:/auth/login": { max: 10, window: 60000 },
  "POST:/auth/signup": { max: 5, window: 60000 },
  "POST:/auth/otp": { max: 3, window: 60000 },
  "POST:/upload": { max: 10, window: 60000 },
  "GET:/api/videos/feed": { max: 60, window: 60000 },
};

const DEFAULT_LIMIT = { max: 100, window: 60000 };

export const rateLimitMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;

  // Match endpoint config
  let config = DEFAULT_LIMIT;
  for (const [pattern, limit] of Object.entries(ENDPOINT_LIMITS)) {
    const [pMethod, pPath] = pattern.split(":");
    if (pMethod === method && path.startsWith(pPath)) {
      config = limit;
      break;
    }
  }

  const ip = c.req.header("CF-Connecting-IP") || c.req.header("x-real-ip") || "unknown";
  const key = `ratelimit:${method}:${path}:${ip}`;

  try {
    const cache = new CacheService(c.env as { UPSTASH_REDIS_URL: string; UPSTASH_REDIS_TOKEN: string });
    const result = await cache.checkRateLimit(key, config.max, config.window);

    c.header("X-RateLimit-Limit", String(config.max));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetMs / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      return c.json({ error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please wait." } }, 429);
    }
  } catch {
    // If Redis is unavailable, allow the request through
  }

  await next();
});
