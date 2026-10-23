-- Separate, revocable preorder-only grants stored by the D1 operator.
-- Cloudflare APIs never accept client-supplied roles. Firebase still verifies
-- the UID, technical email, emailVerified flag and disabled status per request.
CREATE TABLE IF NOT EXISTS preorder_staff_access (
  uid TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role = 'preorders'),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  assigned_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
