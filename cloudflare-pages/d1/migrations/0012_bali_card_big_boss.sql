-- Preserve every staged card and dependent ledger row while allowing Big Boss.
-- Execute as one atomic migration/batch. Never enables wallet cutover.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE bali_id_cards_staging_next (
 firebase_uid TEXT PRIMARY KEY NOT NULL REFERENCES bali_guest_profiles_staging(firebase_uid),
 card_number TEXT NOT NULL UNIQUE,
 level TEXT NOT NULL CHECK(level IN ('Member','Silver','Gold','Platinum','Black','Private','ResidentDJ','BigBoss')),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 privileges_json TEXT NOT NULL DEFAULT '[]'
   CHECK(json_valid(privileges_json) AND json_type(privileges_json)='array'),
 source_updated_at_ms INTEGER NOT NULL CHECK(source_updated_at_ms>0),
 source_digest TEXT NOT NULL CHECK(length(source_digest)=64),
 staged_at_ms INTEGER NOT NULL
);
INSERT INTO bali_id_cards_staging_next SELECT * FROM bali_id_cards_staging;
DROP TABLE bali_id_cards_staging;
ALTER TABLE bali_id_cards_staging_next RENAME TO bali_id_cards_staging;
PRAGMA defer_foreign_keys=OFF;
