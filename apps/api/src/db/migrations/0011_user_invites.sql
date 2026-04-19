-- Admin-issued single-use invitations for onboarding users by email.
-- An invited user can set a password and sign in even when registration is
-- locked (registrationLockService). Tokens are sha256-hashed at rest;
-- the raw value only appears in the email link and the admin response.
-- Consumed and revoked invites are retained for audit.

CREATE TABLE IF NOT EXISTS user_invites (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT         NOT NULL,
  display_name      TEXT,                                         -- optional; falls back to email at accept
  role              TEXT         NOT NULL DEFAULT 'user',         -- enforced 'user' in service layer
  token_hash        TEXT         NOT NULL UNIQUE,
  invited_by        UUID         REFERENCES users(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ  NOT NULL,
  accepted_at       TIMESTAMPTZ,
  accepted_user_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_invites_email_idx      ON user_invites(lower(email));
CREATE INDEX IF NOT EXISTS user_invites_expires_at_idx ON user_invites(expires_at);

-- No RLS policy for app_user — invites are admin-only, accessed exclusively
-- via adminDb (mirrors refresh_tokens and security_events pre-auth usage).
GRANT ALL ON user_invites TO app_admin;
