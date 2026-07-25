-- 001_users.sql: Users & profiles

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE,
  phone       TEXT UNIQUE,
  username    TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  bio         TEXT DEFAULT '',
  avatar_url  TEXT DEFAULT '',
  locale      TEXT NOT NULL DEFAULT 'bn',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_created_at ON users (created_at DESC);
CREATE INDEX idx_users_locale ON users (locale);

-- Supabase Auth integration: we store auth in auth.users (managed by Supabase),
-- and this users table holds profile data. The auth.users id is the FK.
-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_public" ON users
  FOR SELECT USING (true);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
-- 002_videos.sql: Videos metadata

CREATE TYPE video_status AS ENUM ('processing', 'ready', 'failed', 'flagged');
CREATE TYPE video_privacy AS ENUM ('public', 'friends', 'private');

CREATE TABLE videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption         TEXT DEFAULT '',
  hashtags        TEXT[] DEFAULT '{}',
  sound_id        UUID,
  status          video_status NOT NULL DEFAULT 'processing',
  r2_key          TEXT NOT NULL,
  stream_uid      TEXT,
  thumbnail_url   TEXT DEFAULT '',
  duration        INTEGER DEFAULT 0,
  width           INTEGER DEFAULT 0,
  height          INTEGER DEFAULT 0,
  privacy         video_privacy NOT NULL DEFAULT 'public',
  allow_comments  BOOLEAN NOT NULL DEFAULT true,
  allow_duet      BOOLEAN NOT NULL DEFAULT true,
  allow_stitch    BOOLEAN NOT NULL DEFAULT true,
  allow_download  BOOLEAN NOT NULL DEFAULT true,
  locale          TEXT NOT NULL DEFAULT 'bn',
  likes_count     INTEGER NOT NULL DEFAULT 0,
  comments_count  INTEGER NOT NULL DEFAULT 0,
  shares_count    INTEGER NOT NULL DEFAULT 0,
  views_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_creator_id ON videos (creator_id, created_at DESC);
CREATE INDEX idx_videos_created_at ON videos (created_at DESC);
CREATE INDEX idx_videos_hashtags ON videos USING GIN (hashtags);
CREATE INDEX idx_videos_sound_id ON videos (sound_id);
CREATE INDEX idx_videos_status ON videos (status) WHERE status = 'ready';

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos_read_public" ON videos
  FOR SELECT USING (privacy = 'public' OR privacy = 'friends' OR creator_id = auth.uid());

CREATE POLICY "videos_insert_own" ON videos
  FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY "videos_update_own" ON videos
  FOR UPDATE USING (creator_id = auth.uid());

CREATE TRIGGER trg_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
-- 003_likes_comments.sql

CREATE TABLE likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE INDEX idx_likes_video_id ON likes (video_id, created_at DESC);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_all_authenticated" ON likes
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "likes_select_public" ON likes
  FOR SELECT USING (true);

CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_video_id ON comments (video_id, created_at DESC);
CREATE INDEX idx_comments_parent_id ON comments (parent_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select_public" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_update_own" ON comments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "comments_delete_own" ON comments FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comment likes (for liking comments)
CREATE TABLE comment_likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
-- 004_follows.sql

CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows (follower_id, created_at DESC);
CREATE INDEX idx_follows_following ON follows (following_id, created_at DESC);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select_public" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete_own" ON follows FOR DELETE USING (follower_id = auth.uid());

CREATE OR REPLACE FUNCTION increment_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET followers_count = followers_count - 1 WHERE id = OLD.following_id;
  UPDATE users SET following_count = following_count - 1 WHERE id = OLD.follower_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follows_insert AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION increment_follow_counts();

CREATE TRIGGER trg_follows_delete AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION decrement_follow_counts();

-- Add counter columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
-- 005_notifications.sql

CREATE TYPE notification_type AS ENUM (
  'like', 'comment', 'follow', 'mention', 'milestone', 'subscription', 'system'
);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  video_id   UUID REFERENCES videos(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES comments(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  read       BOOLEAN NOT NULL DEFAULT false,
  locale     TEXT NOT NULL DEFAULT 'bn',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_read ON notifications (user_id, read) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());
-- 006_subscriptions.sql

CREATE TYPE subscription_tier AS ENUM ('monthly_basic', 'monthly_premium', 'annual_basic', 'annual_premium');
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'incomplete', 'expired');

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscriber_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                  subscription_tier NOT NULL,
  stripe_subscription_id TEXT,
  status                subscription_status NOT NULL DEFAULT 'active',
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end    TIMESTAMPTZ NOT NULL,
  canceled_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, subscriber_id)
);

CREATE INDEX idx_subscriptions_creator ON subscriptions (creator_id, status);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions (subscriber_id, status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (creator_id = auth.uid() OR subscriber_id = auth.uid());

-- Subscriber-only content
CREATE TABLE subscriber_content (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tier       subscription_tier NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriber_content_creator ON subscriber_content (creator_id);

ALTER TABLE subscriber_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriber_content_select" ON subscriber_content
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.creator_id = subscriber_content.creator_id
        AND s.subscriber_id = auth.uid()
        AND s.status = 'active'
    )
  );
-- 007_payments_moderation.sql

CREATE TYPE ledger_entry_type AS ENUM (
  'coin_purchase', 'gift_sent', 'gift_received', 'subscription_payment',
  'subscription_payout', 'creator_fund_payout', 'withdrawal', 'refund'
);

CREATE TYPE report_target_type AS ENUM ('video', 'user', 'comment');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');

-- Immutable ledger for all financial transactions
CREATE TABLE ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            ledger_entry_type NOT NULL,
  amount          INTEGER NOT NULL, -- in smallest currency unit (cents/paisa)
  currency        TEXT NOT NULL DEFAULT 'usd',
  balance_before  INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  payment_provider TEXT,
  provider_txn_id  TEXT,
  idempotency_key  TEXT UNIQUE,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_user ON ledger (user_id, created_at DESC);
CREATE INDEX idx_ledger_idempotency ON ledger (idempotency_key);

ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_select_own" ON ledger FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ledger_insert_system" ON ledger FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- User coin balance
ALTER TABLE users ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 0;

-- Reports for moderation
CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  status      report_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_status ON reports (status, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_select_admin" ON reports FOR SELECT USING (auth.role() = 'service_role');

-- Moderation action log
CREATE TABLE moderation_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL, -- 'flag_video', 'hide_video', 'restore_video', 'ban_user', 'warn_user'
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_actions_admin" ON moderation_actions
  FOR ALL USING (auth.role() = 'service_role');

-- Creator fund / payout preferences
CREATE TABLE creator_payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'bdt',
  method         TEXT NOT NULL, -- 'bkash', 'nagad', 'bank', 'stripe'
  account_details JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  reference      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creator_payouts_creator ON creator_payouts (creator_id, created_at DESC);

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_select_own" ON creator_payouts FOR SELECT USING (creator_id = auth.uid());
-- Migration 008: Missing indexes, RLS policies, and counter triggers
-- Apply after migrations 001-007.

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_target ON moderation_actions (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_videos_trending ON videos (created_at DESC) WHERE status = 'ready' AND privacy = 'public';
CREATE INDEX IF NOT EXISTS idx_videos_privacy_status ON videos (privacy, status) WHERE privacy = 'public' AND status = 'ready';
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE read = false;

-- ── Enable RLS on comment_likes ──
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_likes_select_public" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "comment_likes_insert_own" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment_likes_delete_own" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- ── Counter triggers for likes ──
CREATE OR REPLACE FUNCTION increment_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE videos SET likes_count = likes_count + 1, updated_at = now() WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE videos SET likes_count = GREATEST(0, likes_count - 1), updated_at = now() WHERE id = OLD.video_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_likes_insert ON likes;
CREATE TRIGGER trg_likes_insert
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION increment_video_likes_count();

DROP TRIGGER IF EXISTS trg_likes_delete ON likes;
CREATE TRIGGER trg_likes_delete
  AFTER DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION decrement_video_likes_count();

-- ── Counter triggers for comments ──
CREATE OR REPLACE FUNCTION increment_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE videos SET comments_count = comments_count + 1, updated_at = now() WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE videos SET comments_count = GREATEST(0, comments_count - 1), updated_at = now() WHERE id = OLD.video_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_insert ON comments;
CREATE TRIGGER trg_comments_insert
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION increment_video_comments_count();

DROP TRIGGER IF EXISTS trg_comments_delete ON comments;
CREATE TRIGGER trg_comments_delete
  AFTER DELETE ON comments
  FOR EACH ROW
  EXECUTE FUNCTION decrement_video_comments_count();

-- ── Updated_at triggers for tables that have it missing ──
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- ── Add is_admin column to users if not exists ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- ── Add updated_at columns to tables that might have them missing ──
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE moderation_actions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE creator_payouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
