-- BALI ID nested Firestore history. Separate table: migration 0006 already
-- exists in production and must remain unchanged.
CREATE TABLE IF NOT EXISTS bali_nested_source_snapshots (
  snapshot_id TEXT NOT NULL CHECK(length(snapshot_id)=32),
  source_path TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('event-checkins','transfer-inbox')),
  firebase_uid TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
  staged_at_ms INTEGER NOT NULL CHECK(staged_at_ms>0),
  PRIMARY KEY(snapshot_id,source_path)
);
CREATE INDEX IF NOT EXISTS ix_bali_nested_snapshot_uid
 ON bali_nested_source_snapshots(snapshot_id,firebase_uid,scope);
