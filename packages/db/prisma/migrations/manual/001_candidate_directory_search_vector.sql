-- Migration: candidate_directory full-text search vector
-- Run AFTER the initial prisma migrate creates the candidate_directory table.

-- 1. GIN index for fast tsvector lookup
CREATE INDEX IF NOT EXISTS idx_candidate_directory_search_vector
  ON candidate_directory USING GIN (search_vector);

-- 2. Function to compute the tsvector from candidate fields
CREATE OR REPLACE FUNCTION candidate_directory_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.current_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.company_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.personal_email, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.linkedin_url, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger: fires on INSERT or UPDATE
DROP TRIGGER IF EXISTS trg_candidate_directory_search_vector ON candidate_directory;
CREATE TRIGGER trg_candidate_directory_search_vector
  BEFORE INSERT OR UPDATE OF full_name, current_title, company_name, personal_email, linkedin_url
  ON candidate_directory
  FOR EACH ROW
  EXECUTE FUNCTION candidate_directory_search_vector_update();

-- 4. Backfill existing rows (safe to run multiple times)
UPDATE candidate_directory SET updated_at = now()
WHERE search_vector IS NULL;
