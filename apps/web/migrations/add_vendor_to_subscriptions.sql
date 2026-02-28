-- Migration: Add vendor_canonical_id to subscriptions
-- Links each subscriber account to the vendor they are paying to monitor.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS vendor_canonical_id TEXT
    REFERENCES vendors(canonical_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_vendor
  ON subscriptions(vendor_canonical_id);
