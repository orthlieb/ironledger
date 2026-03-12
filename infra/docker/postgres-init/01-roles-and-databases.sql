-- Runs automatically on first `docker compose up` via docker-entrypoint-initdb.d.
-- Creates the two application roles and the test database.
-- The main database (ironledger) is already created by POSTGRES_DB above.

-- ── Roles ────────────────────────────────────────────────────────────────────

CREATE ROLE app_admin WITH LOGIN PASSWORD 'devpassword_admin' CREATEDB;
CREATE ROLE app_user  WITH LOGIN PASSWORD 'devpassword_user';

-- Grant role membership so login users can act as these roles
GRANT app_admin TO postgres;

-- ── Databases ─────────────────────────────────────────────────────────────────

-- Grant the app roles access to the main database
GRANT ALL PRIVILEGES ON DATABASE ironledger TO app_admin;
GRANT CONNECT         ON DATABASE ironledger TO app_user;

-- Test database (used by integration and e2e tests)
CREATE DATABASE ironledger_test OWNER app_admin;
GRANT ALL PRIVILEGES ON DATABASE ironledger_test TO app_admin;
GRANT CONNECT         ON DATABASE ironledger_test TO app_user;

-- ── Schema permissions ────────────────────────────────────────────────────────

\connect ironledger
GRANT ALL   ON SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA public TO app_user;

\connect ironledger_test
GRANT ALL   ON SCHEMA public TO app_admin;
GRANT USAGE ON SCHEMA public TO app_user;
