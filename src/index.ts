import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Variables, Env } from "./config";

// Middleware
import { errorMiddleware, notFoundHandler } from "./middleware/error";
import { i18nMiddleware } from "./middleware/i18n";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { optionalAuthMiddleware } from "./middleware/auth";
void optionalAuthMiddleware;

// Routes
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import videosRoutes from "./routes/videos";
import uploadRoutes from "./routes/upload";
import socialRoutes from "./routes/social";
import notificationsRoutes from "./routes/notifications";
import paymentsRoutes from "./routes/payments";
import searchRoutes from "./routes/search";
import adminRoutes from "./routes/admin";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Global Middleware ──
const ALLOWED_ORIGINS = [
  "https://surswag.com",
  "http://localhost:5173",
  "http://localhost:4173",
  // Cloudflare Pages preview deployments
  /^https:\/\/[a-z0-9-]+\.snsfrontent\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.sur-swag\.pages\.dev$/,
];

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return "https://surswag.com";
    if (ALLOWED_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)))) {
      return origin;
    }
    return "https://surswag.com";
  },
  credentials: true,
  maxAge: 86400,
}));
app.use("*", logger());
app.use("*", errorMiddleware);
app.use("*", i18nMiddleware);
app.use("*", rateLimitMiddleware);

// ── Health Check (no auth) ──
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "sur-swag-backend",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// ── Mount Routes ──
app.route("/auth", authRoutes);
app.route("/users", usersRoutes);
app.route("/videos", videosRoutes);
app.route("/upload", uploadRoutes);

// Social routes are nested under /videos and /users, mounted with / prefix
app.route("/", socialRoutes);

app.route("/notifications", notificationsRoutes);
app.route("/payments", paymentsRoutes);
app.route("/search", searchRoutes);
app.route("/admin", adminRoutes);

// ── 404 Handler ──
app.notFound(notFoundHandler as unknown as Parameters<typeof app.notFound>[0]);

// ── Export for Cloudflare Workers ──
export default app;

// ── Export Durable Objects for wrangler.toml ──
export { DMRoom } from "./durable-objects/dm";
export { LiveRoom } from "./durable-objects/live-room";
