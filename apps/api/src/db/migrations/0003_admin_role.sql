-- 0003_admin_role.sql
-- Adds a role column to the users table for admin access control.
-- Only an existing admin (or the seed script) can grant admin role.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Grant admin role to known admin accounts (safe to re-run)
UPDATE users SET role = 'admin' WHERE email IN ('admin@ironledger.local', 'dev@ironledger.local');
