CREATE INDEX CONCURRENTLY IF NOT EXISTS users_stripe_customer_id_idx ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
