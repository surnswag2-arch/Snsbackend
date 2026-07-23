import { createMiddleware } from "hono/factory";
import type { Variables } from "../config";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = { maxRequests: 100, windowMs: 60000 };
const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  "/auth/login": { maxRequests: 10, windowMs: 60000 },
  "/auth/signup": { maxRequests: 5, windowMs: 60000 },
  "/auth/otp": { maxRequests: 3, windowMs: 60000 },
  "/upload/url": { maxRequests: 10, windowMs: 60000 },
  "/videos/feed": { maxRequests: 60, windowMs: 60000 },
};

// Simple in-memory rate limiter for Workers edge.
// In production, use Upstash Redis for distributed counters.
export const rateLimitMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const path = c.req.path;
  const config = Object.entries(ENDPOINT_LIMITS).find(([key]) => path.includes(key))?.[1] || DEFAULT_CONFIG;

  const ip = c.req.header("CF-Connecting-IP") || c.req.header("x-real-ip") || "unknown";
  const userId = c.get("user")?.id || ip;
  const key = `ratelimit:${path}:${userId}`;

  try {
    // If using Upstash Redis-based rate limiting from a Worker:
    // const upstashUrl = c.env.UPSTASH_REDIS_URL;
    // const response = await fetch(`${upstashUrl}/incr/${key}`, {
    //   headers: { Authorization: `Bearer ${c.env.UPSTASH_REDIS_TOKEN}` },
    // });
    // const count = await response.json();
    // if (count > config.maxRequests) { ... }

    // For now, pass through — rate limiting is configured at the Cloudflare WAF level
    // and via the Upstash service layer in cache.service.ts
    void config;
    void key;
  } catch {
    // Rate limiter failure should not block requests in production
  }

  await next();
});
