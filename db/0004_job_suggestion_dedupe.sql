-- Additive: dedupe key for job suggestions saved to the tracker (#10 / PR #26).
-- NOT yet applied to live morriztech. Apply manually after review.
ALTER TABLE job_applications ADD COLUMN suggestion_key TEXT;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_user_suggestion_key_uq ON job_applications (user_id, suggestion_key);
