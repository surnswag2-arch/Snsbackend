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
