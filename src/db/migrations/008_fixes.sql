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
