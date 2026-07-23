import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { optionalAuthMiddleware } from "../middleware/auth";
import { searchQuerySchema } from "../db/schema";

const search = new Hono<{ Variables: Variables }>();

// ── GET /search ──
search.get("/", optionalAuthMiddleware, zValidator("query", searchQuerySchema), async (c) => {
  const { q, type, limit } = c.req.valid("query");

  // In production:
  // const searchService = new SearchService(env);
  // const results = await searchService.searchVideos(q, limit);
  // return c.json({ data: results.hits, total: results.totalHits });

  return c.json({
    query: q,
    type,
    data: [
      {
        id: crypto.randomUUID(),
        type: "video",
        caption: `Video matching "${q}"`,
        creator: { username: "creator1" },
        likes_count: 12300,
      },
    ],
    total: 1,
    hasMore: false,
  });
});

export default search;
