-- Immutable source copies for BALI ID migration. Never connected to guest UI.
-- The primary Firebase source remains authoritative until a separate verified
-- release. All original wallet grants and receipts survive as canonical JSON.
CREATE TABLE IF NOT EXISTS bali_source_snapshots (
  snapshot_id TEXT NOT NULL CHECK(length(snapshot_id)=32),
  source_path TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN (
    'profiles','cards','privileges','wallets','operations','transfers',
    'bonus-kinds','privilege-rules','agreements','event-checkins','transfer-inbox')),
  firebase_uid TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
  staged_at_ms INTEGER NOT NULL CHECK(staged_at_ms>0),
  PRIMARY KEY(snapshot_id,source_path)
);
CREATE INDEX IF NOT EXISTS ix_bali_snapshots_uid
  ON bali_source_snapshots(snapshot_id,firebase_uid,scope);
CREATE INDEX IF NOT EXISTS ix_bali_snapshots_scope
  ON bali_source_snapshots(snapshot_id,scope);
CREATE TABLE IF NOT EXISTS bali_snapshot_manifests (
  snapshot_id TEXT PRIMARY KEY NOT NULL CHECK(length(snapshot_id)=32),
  source_project TEXT NOT NULL CHECK(source_project='bali-menu-5a48b'),
  state TEXT NOT NULL CHECK(state IN ('pending','verified','blocked')),
  document_count INTEGER NOT NULL CHECK(document_count>=0),
  source_manifest_digest TEXT NOT NULL CHECK(length(source_manifest_digest)=64),
  staged_manifest_digest TEXT NOT NULL CHECK(length(staged_manifest_digest)=64),
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  notes TEXT NOT NULL DEFAULT ''
);
-- No trigger or flag permits a balance switch. No realtime wallet code reads
-- either table; a future cutover requires a separate approved transaction.
