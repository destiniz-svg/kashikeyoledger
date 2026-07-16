-- ===========================================================================
-- Phase 2 · AI ingestion — Storage for uploaded receipts / invoices / bills.
-- ===========================================================================
-- Applied to Supabase as the migration `phase2_documents_bucket`. Idempotent.
--
-- The `documents` and `ai_extractions` tables already exist (schema from the
-- earlier data model). This migration only provisions the private Storage
-- bucket the API uploads into. The pipeline itself lives in the app:
--   1. POST /documents { filename, contentType, dataBase64, captureSource? }
--   2. the file is stored at  documents/<org>/<sha256>  (deduplicated by hash)
--   3. a `documents` row is inserted (status UPLOADED)
--   4. Claude reads the file (src/aiExtract.ts) and the structured result is
--      written to `ai_extractions`; the document moves to EXTRACTED (or
--      EXTRACTION_FAILED). With no ANTHROPIC_API_KEY the file is still stored
--      and the document stays UPLOADED.
--
-- Access is service-role only (the API is a trusted backend); the bucket is
-- private, so no public read policies are created.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,   -- 10 MB
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;
