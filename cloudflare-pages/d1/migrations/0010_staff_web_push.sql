-- BALI STAFF Web Push subscriptions (no passwords, no order/customer details).
CREATE TABLE IF NOT EXISTS staff_push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL,
 employee_uid TEXT NOT NULL,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth_secret TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_push_employee ON staff_push_subscriptions(employee_uid);
-- Per-order/per-device deduplication; purge expired receipt records after 30 days.
CREATE TABLE IF NOT EXISTS staff_push_receipts (
 order_id TEXT NOT NULL,
 subscription_id TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 PRIMARY KEY(order_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_push_receipts_age ON staff_push_receipts(created_at_ms);
