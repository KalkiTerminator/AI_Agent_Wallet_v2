-- subscription_invoices: idempotency table for invoice.paid credit grants
CREATE TABLE subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  credits_granted INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscription_invoices_user_id_idx ON subscription_invoices(user_id);

-- onboarded_at: server-side onboarding state
ALTER TABLE users ADD COLUMN onboarded_at TIMESTAMPTZ;

-- analytics query performance indexes
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments(created_at);
CREATE INDEX IF NOT EXISTS tool_usages_created_at_idx ON tool_usages(created_at);
CREATE INDEX IF NOT EXISTS subscriptions_period_status_idx ON subscriptions(current_period_start, current_period_end, status);
