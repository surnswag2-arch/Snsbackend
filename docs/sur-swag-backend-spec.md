# SUR & SWAG — Backend Architecture Spec (Scale: 20M Users)

## 1. Overview & Design Goals

Goal: Support ~20 million registered users, with realistic concurrency of roughly 200K-500K simultaneous active users at peak, video-heavy traffic (upload + playback), real-time features (DM, live, notifications), and monetization (payments, payouts).

Design principles:
- Edge-first: push as much as possible to Cloudflare's edge network (Workers, Cache, CDN) to reduce origin load and latency for Bengali-region users.
- Stateless application servers: horizontal scaling, no server-local session state.
- Async by default: anything heavy (video transcoding, notifications, analytics) goes through a queue, never blocks the request path.
- Read-heavy optimization: the feed is read millions of times more than it's written — cache aggressively, denormalize where needed.
- Cost control at scale: video is the biggest cost driver — architecture must avoid raw egress-metered storage for hot video delivery.

---

## 2. High-Level Architecture Diagram (described)

```
[Mobile/Web Client]
       |
       v
[Cloudflare CDN + WAF + Rate Limiting]
       |
       v
[Cloudflare Workers (Hono framework)] --- edge API layer, auth check, routing
       |
       +--> [Supabase (Postgres + Auth + Realtime)]  -- primary relational data
       |
       +--> [Cloudflare KV / Durable Objects] -- session cache, rate limit counters, live counters
       |
       +--> [Cloudflare R2] -- raw uploaded video storage, images, avatars
       |
       +--> [Cloudflare Stream] -- video transcoding + adaptive playback + CDN delivery
       |
       +--> [Redis / Upstash] -- hot cache (feed, trending, session), pub/sub for realtime fan-out
       |
       +--> [Queue: Cloudflare Queues or BullMQ+Redis] -- async jobs (transcoding triggers, notifications, analytics events)
       |
       +--> [Search: Meilisearch or Typesense] -- user/hashtag/sound search
       |
       +--> [Payments: Stripe + bKash/Nagad API] -- coins, subscriptions, payouts
```

---

## 3. Core Components

### 3.1 Edge API Layer — Cloudflare Workers + Hono
- Hono is the request framework running on Workers: lightweight, fast cold-start, ideal for edge.
- All client requests hit Workers first — this is where auth token validation, rate limiting, and request routing happen before touching origin services.
- Benefits at 20M-user scale: no single origin server to overload; Cloudflare auto-scales Workers globally; requests are served from the edge location closest to the user (critical for Bangladesh/India latency).
- Workers handle: auth middleware, request validation, calling Supabase/Postgres via HTTP or connection pooler, calling R2/Stream APIs, writing to queues.

### 3.2 Database — Supabase (Postgres)
- Supabase provides managed Postgres + built-in Auth + Realtime (via logical replication) + Row Level Security.
- Use Supabase for: users, profiles, follows, videos metadata, comments, likes, subscriptions, notifications table, reports.
- At 20M users, plan for:
  - Connection pooling (Supabase's built-in pooler / PgBouncer) since Workers make many short-lived connections.
  - Read replicas for heavy read paths (feed queries, profile views) separate from the write-heavy primary (likes, comments, follows).
  - Partitioning large tables (videos, likes, comments, notifications) by time or user-id range once row counts pass ~50-100M rows.
  - Indexes on: user_id, video_id, created_at, hashtag, sound_id — every query path in the feed/search must hit an index, never a full table scan.
- Supabase Auth handles signup/login/OTP/OAuth (Google/Facebook) — avoids building auth from scratch.
- Supabase Realtime (Postgres logical replication) can power live comment counts, live like counts, and notification pushes without a separate WebSocket server for simpler cases.

### 3.3 Video Storage & Delivery — R2 + Cloudflare Stream
- Raw upload flow: client uploads raw video to R2 (via presigned URL from Workers) — R2 has zero egress fees, which matters enormously at this scale.
- Processing flow: a queue job picks up the R2 object, sends it to Cloudflare Stream for transcoding into adaptive bitrate renditions (multiple resolutions for different network speeds — critical for Bangladesh's mixed 3G/4G reality).
- Delivery flow: Stream serves the transcoded video via HLS/DASH through Cloudflare's global edge network with no additional CDN needed — this is the single most important cost/scale decision, since raw R2 delivery without Stream would require you to build your own transcoding + adaptive bitrate + player pipeline.
- Thumbnails/covers: generated via Stream or Cloudflare Images, stored/served from Cloudflare Images (built-in resizing, format negotiation — WebP/AVIF automatically).
- Avatars/profile images: Cloudflare Images (cheap, handles resizing variants automatically).

### 3.4 Caching Layer — Cloudflare Cache + Redis/Upstash
- Cloudflare Cache (CDN edge cache): cache public API responses that don't change per-user (trending sounds, public profile data, hashtag pages) using Cache-Control headers and Cache API within Workers.
- Redis (Upstash, serverless-friendly): 
  - Feed pre-computation cache (store ranked "For You" feed per user, refreshed periodically rather than computed live on every request).
  - Rate limiting counters (uploads per hour, comment spam prevention).
  - Real-time counters (live viewer count, like count buffering before flushing to Postgres in batches — avoids hammering Postgres with every single like as a write).
  - Session/token cache for fast auth checks at the edge.
- Rule of thumb at 20M users: any data read more than ~100x more often than it's written should be cached, not queried live.

### 3.5 Queue System — Cloudflare Queues (or BullMQ + Redis as fallback)
- Every slow or bursty operation goes through a queue instead of blocking the API response:
  - Video transcoding trigger (upload finished → queue job → call Stream API)
  - Notification fan-out (a popular creator's post needs to notify millions of followers — never do this synchronously)
  - Analytics event ingestion (views, watch-time, engagement — batched and processed asynchronously)
  - Email/SMS sending (OTP, payout confirmations)
  - Content moderation jobs (AI flagging pipeline runs async after upload, video goes live as "under review" or gated based on your safety policy)
- Cloudflare Queues integrates natively with Workers (no separate infra to run); BullMQ+Redis is a solid fallback if more complex job orchestration (retries, priorities, delayed jobs) is needed.

### 3.6 Search — Meilisearch or Typesense
- Powers: user search, hashtag search, sound search, video caption search.
- Both are lightweight, fast, self-hostable or managed-cloud options — much simpler to operate than Elasticsearch at this stage, and sufficient for 20M-user scale search workloads.
- Index update flow: whenever a video/user/hashtag is created or updated, a queue job pushes the update into the search index (never index synchronously in the request path).

### 3.7 Real-Time Features — Durable Objects + WebSockets
- Cloudflare Durable Objects: ideal for stateful real-time coordination at the edge — e.g., a single Durable Object instance per live-stream room to coordinate viewer count, live comments, and gifts in real time.
- DMs: WebSocket connections routed through Workers, backed by Durable Objects (one per conversation or per user) to hold connection state and broadcast messages instantly without polling Postgres.
- Live viewer counts, live reactions: Durable Objects handle the high-frequency, ephemeral state (viewer count ticking up/down) without hammering the primary database.

### 3.8 Payments & Payouts
- Stripe: handles coin purchases (credit/debit card, international payments) and creator subscription billing (recurring monthly charges).
- bKash/Nagad API integration: required for Bangladesh-local payment methods (topping up coins) and creator payouts (cashing out diamonds/earnings to local mobile banking).
- All payment webhooks (Stripe webhook, bKash callback) go through Workers, validated, then written to Postgres via a queue job (never trust/process financial state changes synchronously without idempotency checks).
- Ledger table in Postgres: every coin/diamond transaction recorded immutably (append-only) for auditability — critical for handling disputes and financial compliance.

### 3.9 Content Moderation Pipeline
- Upload triggers a queue job that:
  1. Runs automated checks (AI-based nudity/violence detection via a third-party API or self-hosted model)
  2. Flags borderline content for human review queue
  3. Publishes video as public only after passing automated checks (or holds as "processing/under review" if flagged)
- Report system: reports go into a moderation queue table, prioritized by report count and severity, reviewed by moderation team via an internal dashboard.

### 3.10 Observability & Monitoring
- Cloudflare Analytics + Workers Analytics Engine: request-level metrics at the edge (latency, error rates, geographic distribution).
- Error tracking: Sentry (or similar) wired into Workers and any backend services.
- Database monitoring: Supabase's built-in dashboard + custom slow-query alerts.
- Business metrics dashboard: DAU/MAU, video upload rate, watch-time, revenue — computed from analytics events processed via the queue, stored in a separate analytics table/warehouse (avoid polluting the primary transactional Postgres with high-volume analytics writes).

---

## 4. Data Flow Examples

### 4.1 Video Upload Flow
1. Client requests a presigned upload URL from Workers API.
2. Client uploads raw video directly to R2 (bypasses Workers for the large file transfer itself — avoids Worker CPU/time limits).
3. R2 upload-complete event triggers a Queue job.
4. Queue job calls Cloudflare Stream API to transcode the R2 object into adaptive bitrate renditions.
5. Queue job also triggers: thumbnail generation, content moderation scan, search index update.
6. Once transcoding completes (webhook from Stream), video status updates to "ready" in Postgres, and it becomes visible in feeds.

### 4.2 Feed Request Flow ("For You")
1. Client requests next batch of feed videos.
2. Worker checks Redis for a pre-computed ranked feed for this user.
3. If cache hit: return immediately (sub-50ms).
4. If cache miss: Worker queries Postgres (read replica) for a candidate pool (recent popular videos, videos from followed accounts, category-matched videos), applies lightweight ranking, caches result in Redis with short TTL, returns to client.
5. A background job periodically refreshes each active user's cached feed rather than computing it live on every scroll.

### 4.3 Like/Comment Flow (High Write Volume)
1. Client sends like action to Worker.
2. Worker increments a counter in Redis immediately (instant UI feedback) and pushes a queue job.
3. Queue job batches writes to Postgres (e.g., flush every few seconds or every N likes) rather than one write per like — critical to avoid overwhelming Postgres at viral-video scale (a single video can get thousands of likes per second).

---

## 5. Scaling Considerations Checklist

- [ ] All video delivery through Cloudflare Stream/CDN — never serve hot video directly from R2 to end users at scale.
- [ ] Postgres read replicas separated from write path once traffic grows.
- [ ] Redis/Upstash caching for feed, trending, and counters — never compute ranking live per-request at scale.
- [ ] All heavy/bursty work goes through queues — uploads, notifications, moderation, analytics.
- [ ] Rate limiting at the edge (Workers) for uploads, comments, follows, login attempts — prevents abuse before it reaches origin.
- [ ] Durable Objects for live/real-time state instead of hammering Postgres with high-frequency updates.
- [ ] Search indexed asynchronously, never blocking writes.
- [ ] Database tables partitioned/archived once row counts get large (videos, likes, notifications, analytics events).
- [ ] CDN cache headers set correctly on all cacheable public endpoints (profiles, trending, hashtag pages).
- [ ] Financial transactions (coins, payouts) go through an append-only ledger table with idempotency keys on all payment webhooks.

---

## 6. Full Tech Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Edge API | Cloudflare Workers + Hono | Request routing, auth, rate limiting |
| Database | Supabase (Postgres) | Users, videos metadata, comments, likes, follows, subscriptions |
| Auth | Supabase Auth | Signup/login/OTP/OAuth |
| Raw video storage | Cloudflare R2 | Zero-egress raw upload storage |
| Video processing/delivery | Cloudflare Stream | Transcoding, adaptive bitrate, global delivery |
| Images | Cloudflare Images | Avatars, thumbnails, covers |
| Cache | Cloudflare Cache (CDN) + Redis/Upstash | Public response caching, feed cache, counters |
| Queue | Cloudflare Queues (or BullMQ + Redis) | Async jobs: transcoding, notifications, moderation, analytics |
| Real-time | Durable Objects + WebSockets | Live streaming state, DMs, live comments |
| Search | Meilisearch or Typesense | User/hashtag/sound/video search |
| Payments | Stripe | Coins, subscriptions (international) |
| Local payments | bKash/Nagad API | Coin top-up and creator payouts (Bangladesh) |
| Moderation | Third-party AI moderation API + human review queue | Content safety |
| Monitoring | Cloudflare Analytics + Sentry | Observability, error tracking |

---

## 7. Notes / Decisions Log

- Cloudflare Stream chosen over raw R2-only video delivery: Stream bundles encoding, adaptive bitrate ladder, manifest generation, and a production player — building this manually on R2 alone would require significant dedicated engineering effort and is not worth it at this stage. R2 is still used as the raw-upload landing zone before Stream processes it.
- Supabase chosen over rolling custom Postgres + custom auth: gets managed Postgres, Auth, and Realtime in one product, significantly reducing backend build time — can migrate to self-managed Postgres later if needed without changing the data model.
- Hono + Workers chosen for the API layer because it's edge-native, has minimal cold-start overhead, and scales automatically without capacity planning — important given unpredictable viral-growth traffic patterns typical of short-video apps.
- Redis/Upstash is not a replacement for Postgres — it's a cache and buffer layer. Postgres remains the source of truth; Redis absorbs high-frequency read/write pressure (feed cache, like counters) before it hits the database.
- Durable Objects chosen for live/real-time coordination instead of a traditional standalone WebSocket server — keeps everything within the Cloudflare edge ecosystem rather than introducing a separate real-time infrastructure to operate.
- This architecture assumes eventual, not instant, consistency for high-frequency counters (likes, views) — exact real-time accuracy is traded for scale; counts settle within seconds via batched writes.
