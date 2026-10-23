-- BALI ID staging for reconciliation with Firebase. No guest read/write route
-- is attached to these tables. Source of truth remains Firestore until
-- every UID, card, grant, operation and COIN balance is reconciled.
-- These definitions mirror the already-created production D1 staging tables.
CREATE TABLE IF NOT EXISTS bali_guest_profiles_staging (
 firebase_uid TEXT PRIMARY KEY NOT NULL,
 display_name TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 consent_version TEXT NOT NULL DEFAULT '',
 source_updated_at_ms INTEGER NOT NULL CHECK(source_updated_at_ms>0),
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
 staged_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bali_id_cards_staging (
 firebase_uid TEXT PRIMARY KEY NOT NULL REFERENCES bali_guest_profiles_staging(firebase_uid),
 card_number TEXT NOT NULL UNIQUE,
 level TEXT NOT NULL CHECK(level IN ('Member','Silver','Gold','Platinum','Black','Private','ResidentDJ')),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 privileges_json TEXT NOT NULL DEFAULT '[]'
   CHECK(json_valid(privileges_json) AND json_type(privileges_json)='array'),
 source_updated_at_ms INTEGER NOT NULL CHECK(source_updated_at_ms>0),
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
 staged_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bali_bonus_grants_staging (
 grant_id TEXT PRIMARY KEY NOT NULL,
 firebase_uid TEXT NOT NULL REFERENCES bali_id_cards_staging(firebase_uid),
 kind TEXT NOT NULL,
 original_quantity INTEGER NOT NULL CHECK(original_quantity>=0),
 remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=original_quantity),
 transferable INTEGER NOT NULL CHECK(transferable IN (0,1)),
 unlimited INTEGER NOT NULL CHECK(unlimited IN (0,1)),
 event_ref TEXT NOT NULL DEFAULT '',
 expires_at_ms INTEGER,
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64)
);
CREATE INDEX IF NOT EXISTS ix_bali_grant_uid
 ON bali_bonus_grants_staging(firebase_uid,kind);
CREATE TABLE IF NOT EXISTS bali_wallet_operations_staging (
 source_operation_id TEXT PRIMARY KEY NOT NULL,
 firebase_uid TEXT NOT NULL REFERENCES bali_id_cards_staging(firebase_uid),
 kind TEXT NOT NULL,
 operation_type TEXT NOT NULL,
 quantity_delta INTEGER NOT NULL,
 created_at_ms INTEGER NOT NULL,
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64)
);
CREATE INDEX IF NOT EXISTS ix_bali_wallet_ops_uid
 ON bali_wallet_operations_staging(firebase_uid,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS bali_coin_balances_staging (
 firebase_uid TEXT PRIMARY KEY NOT NULL REFERENCES bali_id_cards_staging(firebase_uid),
 balance INTEGER NOT NULL CHECK(balance>=0),
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
 source_updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bali_coin_operations_staging (
 source_operation_id TEXT PRIMARY KEY NOT NULL,
 firebase_uid TEXT NOT NULL REFERENCES bali_id_cards_staging(firebase_uid),
 amount_delta INTEGER NOT NULL,
 balance_after INTEGER NOT NULL CHECK(balance_after>=0),
 created_at_ms INTEGER NOT NULL,
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64)
);
CREATE INDEX IF NOT EXISTS ix_bali_coin_ops_uid
 ON bali_coin_operations_staging(firebase_uid,created_at_ms DESC);
CREATE TABLE IF NOT EXISTS bali_migration_checkpoints (
 scope TEXT PRIMARY KEY NOT NULL
   CHECK(scope IN ('preorders','bali-id','bali-bonuses','bali-coin','qr-history')),
 source_backend TEXT NOT NULL,
 source_count INTEGER NOT NULL CHECK(source_count>=0),
 staged_count INTEGER NOT NULL CHECK(staged_count>=0),
 missing_count INTEGER NOT NULL CHECK(missing_count>=0),
 mismatched_count INTEGER NOT NULL CHECK(mismatched_count>=0),
 status TEXT NOT NULL CHECK(status IN ('pending','verified','complete','blocked')),
 snapshot_at_ms INTEGER NOT NULL,
 checked_at_ms INTEGER NOT NULL,
 notes TEXT NOT NULL DEFAULT ''
);
