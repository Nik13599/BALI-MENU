import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync('cloudflare-pages/d1/migrations/0005_bali_id_staging.sql', 'utf8'));
const digest = 'a'.repeat(64);
db.prepare('INSERT INTO bali_guest_profiles_staging VALUES(?,?,?,?,?,?,?,?)')
  .run('guest', 'Test', '', '', '', 1000, digest, 2000);
db.prepare('INSERT INTO bali_id_cards_staging VALUES(?,?,?,?,?,?,?,?)')
  .run('guest', '000101', 'Gold', 1, '["existing privilege"]', 1000, digest, 2000);
db.prepare('INSERT INTO bali_bonus_grants_staging VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run('grant', 'guest', 'shot', 3, 2, 1, 0, '', null, digest);
db.prepare('INSERT INTO bali_wallet_operations_staging VALUES(?,?,?,?,?,?,?)')
  .run('op', 'guest', 'shot', 'grant', 3, 1000, digest);
db.prepare('INSERT INTO bali_coin_balances_staging VALUES(?,?,?,?)')
  .run('guest', 42, digest, 1000);
db.prepare('INSERT INTO bali_coin_operations_staging VALUES(?,?,?,?,?,?)')
  .run('coin-op', 'guest', 42, 42, 1000, digest);
const tables = ['bali_guest_profiles_staging', 'bali_id_cards_staging',
  'bali_bonus_grants_staging', 'bali_wallet_operations_staging',
  'bali_coin_balances_staging', 'bali_coin_operations_staging'];
const snapshot = () => tables.map(t => db.prepare(`SELECT * FROM ${t}`).all());
const before = snapshot();
const migration = readFileSync('cloudflare-pages/d1/migrations/0012_bali_card_big_boss.sql', 'utf8');
for (let attempt = 0; attempt < 2; attempt++) {
  db.exec('BEGIN');
  db.exec(migration);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.exec('COMMIT');
  assert.deepEqual(snapshot(), before, 'Migration must preserve all card and ledger fields');
}
db.prepare('UPDATE bali_id_cards_staging SET level=? WHERE firebase_uid=?').run('BigBoss', 'guest');
assert.equal(db.prepare('SELECT level FROM bali_id_cards_staging').get().level, 'BigBoss');
assert.throws(() => db.exec("UPDATE bali_id_cards_staging SET level='Unknown'"), /CHECK/);
assert.throws(() => db.exec('UPDATE bali_coin_balances_staging SET balance=-1'), /CHECK/);
assert.throws(() => db.exec("DELETE FROM bali_id_cards_staging WHERE firebase_uid='guest'"), /FOREIGN KEY/);
db.exec('BEGIN');
db.exec(migration);
db.exec('ROLLBACK');
assert.equal(db.prepare('SELECT level FROM bali_id_cards_staging').get().level, 'BigBoss');
assert.equal(db.prepare('SELECT balance FROM bali_coin_balances_staging').get().balance, 42);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
db.close();
console.log('Big Boss staging migration: preserves populated ledgers, repeatable, rollback, tier and FK constraints PASS');
