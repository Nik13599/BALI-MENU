-- Raw QR/COIN/BRSM source backup only. Never an active balance ledger.
-- Existing applied migrations and live preorder tables remain unchanged.
CREATE TABLE IF NOT EXISTS bali_loyalty_source_snapshots (
  snapshot_id TEXT NOT NULL CHECK(length(snapshot_id)=32),
  source_path TEXT NOT NULL,
  scope TEXT NOT NULL,
  firebase_uid TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
  staged_at_ms INTEGER NOT NULL CHECK(staged_at_ms>0),
  PRIMARY KEY(snapshot_id,source_path)
);
CREATE INDEX IF NOT EXISTS ix_bali_loyalty_source_scope
 ON bali_loyalty_source_snapshots(snapshot_id,scope);
