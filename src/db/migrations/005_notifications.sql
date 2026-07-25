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
