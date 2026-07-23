import { createMiddleware } from "hono/factory";
import type { Variables, AuthenticatedUser } from "../config";

// For local dev/testing: decode a Supabase JWT
// In production, this runs on Cloudflare Workers at the edge
export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ code: "UNAUTHORIZED", message: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // Decode JWT manually (stateless) or call Supabase Auth API
    // For production: verify the JWT signature using Supabase's JWKS endpoint
    const payload = JSON.parse(atob(token.split(".")[1]));

    const user: AuthenticatedUser = {
      id: payload.sub,
      email: payload.email,
      username: payload.user_metadata?.username || "unknown",
      locale: payload.user_metadata?.locale || "bn",
    };

    c.set("user", user);
  } catch {
    return c.json({ code: "UNAUTHORIZED", message: "Invalid token" }, 401);
  }

  await next();
});

// Optional auth — attaches user if token present, but doesn't reject
export const optionalAuthMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(atob(token.split(".")[1]));
      c.set("user", {
        id: payload.sub,
        email: payload.email,
        username: payload.user_metadata?.username || "unknown",
        locale: payload.user_metadata?.locale || "bn",
      });
    } catch {
      // Invalid token, proceed without user
    }
  }

  await next();
});
