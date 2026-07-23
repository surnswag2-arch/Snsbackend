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
