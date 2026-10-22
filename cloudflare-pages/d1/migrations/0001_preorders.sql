-- BALI D1 operations, v1. Firestore remains source of truth until verified migration.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS preorder_orders (
  id TEXT PRIMARY KEY NOT NULL,
  firestore_id TEXT UNIQUE,
  event_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_title TEXT NOT NULL,
  order_number INTEGER NOT NULL CHECK(order_number>0),
  owner_uid TEXT NOT NULL DEFAULT '',
  created_by_uid TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  table_number TEXT NOT NULL DEFAULT '',
  booking_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
  source TEXT NOT NULL CHECK(source IN ('guest','staff','legacy')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  archived_at_ms INTEGER,
  UNIQUE(event_id,order_number)
);
CREATE INDEX IF NOT EXISTS ix_bali_orders_event ON preorder_orders(event_date,event_id,order_number);
CREATE INDEX IF NOT EXISTS ix_bali_orders_owner ON preorder_orders(owner_uid,created_at_ms DESC);
CREATE INDEX IF NOT EXISTS ix_bali_orders_history ON preorder_orders(archived_at_ms,event_date);
CREATE TABLE IF NOT EXISTS preorder_items (
  order_id TEXT NOT NULL REFERENCES preorder_orders(id) ON DELETE CASCADE,
  menu_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor>=0),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 50),
  PRIMARY KEY(order_id,menu_id)
);
CREATE TABLE IF NOT EXISTS preorder_counters (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_date TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK(last_number>=0),
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS preorder_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_bali_audit_order ON preorder_audit(order_id,created_at_ms);
CREATE TABLE IF NOT EXISTS migration_state (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','verified','complete','failed')),
  record_count INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
