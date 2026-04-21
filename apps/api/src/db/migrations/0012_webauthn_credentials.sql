-- WebAuthn (passkey) credentials per user.
--
-- Each row is one registered authenticator. Users can have many (phone
-- biometric, hardware key, laptop fingerprint). Revoking a passkey is a
-- simple row delete — no token-family cascade like the refresh-token table
-- because each credential stands alone.
--
-- Stored in full: credential_id (the public identifier sent back by the
-- authenticator on sign-in), public_key (CBOR-encoded), the signature
-- counter (tracks clone-attack detection), transports hint, optional
-- user-supplied label, created/last-used timestamps.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id    BYTEA        NOT NULL UNIQUE,
  public_key       BYTEA        NOT NULL,
  counter          BIGINT       NOT NULL DEFAULT 0,
  transports       TEXT[]       NOT NULL DEFAULT '{}',
  label            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);

-- Admin-only table; app_user doesn't need direct access. Pre-auth lookups
-- (during login) go through adminDb, mirroring the refresh_tokens pattern.
GRANT ALL ON webauthn_credentials TO app_admin;
