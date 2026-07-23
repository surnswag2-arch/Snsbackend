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
