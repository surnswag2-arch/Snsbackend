import { createMiddleware } from "hono/factory";
import type { Variables } from "../config";

// Structured error handler — wraps all thrown errors into a consistent API response
export const errorMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  try {
    await next();
  } catch (err: any) {
    console.error(`[${c.get("requestId")}] Error:`, err);

    const status = err.status || err.statusCode || 500;
    const code = err.code || "INTERNAL_ERROR";
    const message = err.message || "An unexpected error occurred";

    c.status(status);
    return c.json({
      error: {
        code,
        message,
        details: err.details || null,
      },
    });
  }
});

// Not found handler
export const notFoundHandler = createMiddleware<{ Variables: Variables }>(async (c) => {
  return c.json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }, 404);
});
