-- Append-only staging details for the Firebase wallet history.
-- No live card/bonus/COIN endpoint may read this table before cutover.
CREATE TABLE IF NOT EXISTS bali_wallet_operation_details_staging (
 source_operation_id TEXT PRIMARY KEY NOT NULL
   REFERENCES bali_wallet_operations_staging(source_operation_id),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
 staged_at_ms INTEGER NOT NULL
);
