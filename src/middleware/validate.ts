import { createMiddleware } from "hono/factory";
import type { Variables } from "../config";

type SchemaLike = {
  parse: (data: unknown) => unknown;
};

// Generic validation middleware — pass a Zod schema
export const validateMiddleware = (schema: SchemaLike) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const contentType = c.req.header("Content-Type") || "";

    let data: unknown;
    if (contentType.includes("application/json")) {
      data = await c.req.json().catch(() => ({}));
    } else if (c.req.method === "GET" || c.req.method === "DELETE") {
      data = c.req.queries();
    } else {
      data = await c.req.parseBody().catch(() => ({}));
    }

    const result = schema.parse(data);
    // Attach parsed data to context for route handlers to use
    c.set("validated" as any, result);
    await next();
  });

// Parse Zod errors into structured format
export function formatZodError(error: any) {
  if (error?.issues) {
    return {
      code: "VALIDATION_ERROR",
      message: "Invalid request data",
      details: error.issues.map((i: any) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  return { code: "VALIDATION_ERROR", message: "Invalid request" };
}
