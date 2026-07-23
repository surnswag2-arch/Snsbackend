// ─── Domain types matching the DB schema ───

export interface User {
  id: string;
  email?: string;
  phone?: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  locale: string;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  coin_balance: number;
  created_at: string;
  updated_at: string;
}

export type VideoStatus = "processing" | "ready" | "failed" | "flagged";
export type VideoPrivacy = "public" | "friends" | "private";

export interface Video {
  id: string;
  creator_id: string;
  caption: string;
  hashtags: string[];
  sound_id?: string;
  status: VideoStatus;
  r2_key: string;
  stream_uid?: string;
  thumbnail_url: string;
  duration: number;
  width: number;
  height: number;
  privacy: VideoPrivacy;
  allow_comments: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  allow_download: boolean;
  locale: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export interface Like {
  user_id: string;
  video_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  video_id: string;
  parent_id?: string;
  user_id: string;
  text: string;
  likes_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export type NotificationType =
  | "like" | "comment" | "follow" | "mention"
  | "milestone" | "subscription" | "system";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id?: string;
  video_id?: string;
  comment_id?: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  locale: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  creator_id: string;
  subscriber_id: string;
  tier: string;
  stripe_subscription_id?: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

export type LedgerEntryType =
  | "coin_purchase" | "gift_sent" | "gift_received"
  | "subscription_payment" | "subscription_payout"
  | "creator_fund_payout" | "withdrawal" | "refund";

export interface LedgerEntry {
  id: string;
  user_id: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  balance_before: number;
  balance_after: number;
  payment_provider?: string;
  provider_txn_id?: string;
  idempotency_key?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: "video" | "user" | "comment";
  target_id: string;
  reason: string;
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  created_at: string;
}
