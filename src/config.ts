import type { ExecutionContext } from "@cloudflare/workers-types";

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;

  // Upstash Redis
  UPSTASH_REDIS_URL: string;
  UPSTASH_REDIS_TOKEN: string;

  // R2
  R2_UPLOADS: R2Bucket;
  R2_BUCKET_NAME: string;

  // Cloudflare Stream
  CLOUDFLARE_STREAM_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;

  // Meilisearch
  MEILISEARCH_URL: string;
  MEILISEARCH_API_KEY: string;

  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // Config
  DEFAULT_LOCALE: string;
  REGIONS: string;

  // Durable Objects
  DM_ROOM: DurableObjectNamespace;
  LIVE_ROOM: DurableObjectNamespace;
}

export type Variables = {
  user?: AuthenticatedUser;
  locale: string;
  requestId: string;
};

export interface AuthenticatedUser {
  id: string;
  email?: string;
  username: string;
  locale: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}
