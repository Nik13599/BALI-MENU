-- D1 is the only orders writer once migration_state.preorders = complete.
-- A retry receipt is committed atomically with its order and line items.
CREATE TABLE IF NOT EXISTS preorder_request_receipts (
  actor_key TEXT NOT NULL,
  request_id TEXT NOT NULL CHECK(length(request_id)=32),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  order_id TEXT NOT NULL REFERENCES preorder_orders(id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(actor_key,request_id)
);
CREATE INDEX IF NOT EXISTS ix_preorder_receipt_order ON preorder_request_receipts(order_id);
