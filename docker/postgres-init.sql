-- Runs once when the Docker container is first created.
-- Creates the app_user login role (app_admin is the POSTGRES_USER from compose).
CREATE USER app_user WITH PASSWORD 'changeme';
