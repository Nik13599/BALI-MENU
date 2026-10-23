-- BALI D1: idempotent staff status changes, no Firestore cutover.
-- Deploy this migration BEFORE enabling the D1 preorder migration flag.
CREATE TABLE IF NOT EXISTS preorder_status_actions (
  actor_uid TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK(length(request_id)=32),
  order_id TEXT NOT NULL REFERENCES preorder_orders(id) ON DELETE CASCADE,
  new_status TEXT NOT NULL CHECK(new_status IN ('pending','confirmed','cancelled')),
  expected_updated_at_ms INTEGER NOT NULL,
  applied_updated_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(actor_uid,request_id)
);
CREATE INDEX IF NOT EXISTS ix_bali_status_action_order
  ON preorder_status_actions(order_id,created_at_ms DESC);
