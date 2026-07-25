import { createMiddleware } from "hono/factory";
import type { Variables } from "../config";
import { SupabaseAuth } from "../db/auth";
import type { Env } from "../config";

export const authMiddleware = createMiddleware<{ Variables: Variables; Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const supabaseAuth = new SupabaseAuth({
      SUPABASE_URL: c.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: c.env.SUPABASE_ANON_KEY,
    });
    const user = await supabaseAuth.verifyToken(token);
    c.set("user", user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid token";
    return c.json({ error: { code: "UNAUTHORIZED", message } }, 401);
  }

  await next();
});

export const optionalAuthMiddleware = createMiddleware<{ Variables: Variables; Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const supabaseAuth = new SupabaseAuth({
        SUPABASE_URL: c.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: c.env.SUPABASE_ANON_KEY,
      });
      const user = await supabaseAuth.verifyToken(token);
      c.set("user", user);
    } catch {
      // Silently continue without user
    }
  }
  await next();
});
