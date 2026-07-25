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
