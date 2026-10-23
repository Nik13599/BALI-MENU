-- Legacy grants keep Firestore revocation semantics until explicitly migrated
-- by the owner. A D1-owned grant never depends on Firestore read quota.
ALTER TABLE preorder_staff_access ADD COLUMN authority TEXT NOT NULL
  DEFAULT 'firestore' CHECK (authority IN ('firestore','d1'));
