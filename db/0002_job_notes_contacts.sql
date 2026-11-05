-- Additive only: notes and contacts per job application (issue #8).
CREATE TABLE IF NOT EXISTS job_application_notes (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS job_application_notes_app_idx ON job_application_notes (user_id, application_id);
CREATE TABLE IF NOT EXISTS job_application_contacts (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT, email TEXT, profile_url TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS job_application_contacts_app_idx ON job_application_contacts (user_id, application_id);
