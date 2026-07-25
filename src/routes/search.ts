import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../config";
import { optionalAuthMiddleware } from "../middleware/auth";
import { searchQuerySchema } from "../db/schema";
import { SearchService } from "../services/search.service";

const search = new Hono<{ Variables: Variables }>();

// ── GET /search ──
search.get("/", optionalAuthMiddleware, zValidator("query", searchQuerySchema), async (c) => {
  const { q, type, limit } = c.req.valid("query");
  const ss = new SearchService(c.env as { MEILISEARCH_URL: string; MEILISEARCH_API_KEY: string });

  switch (type) {
    case "users": {
      const results = await ss.searchUsers(q, limit);
      return c.json({ query: q, type, data: results.hits, total: results.totalHits, hasMore: results.totalPages > 1 });
    }
    case "sounds": {
      const results = await ss.searchSounds(q, limit);
      return c.json({ query: q, type, data: results.hits, total: results.totalHits, hasMore: results.totalPages > 1 });
    }
    case "hashtags": {
      const results = await ss.searchHashtags(q, limit);
      return c.json({ query: q, type, data: results.hits, total: results.totalHits, hasMore: results.totalPages > 1 });
    }
    default: {
      const results = await ss.searchVideos(q, limit);
      return c.json({ query: q, type: "videos", data: results.hits, total: results.totalHits, hasMore: results.totalPages > 1 });
    }
  }
});

export default search;
