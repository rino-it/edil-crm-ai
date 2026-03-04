-- Fix: riconciliazione_log.movimento_id FK was pointing to movimenti_banca_old
-- instead of movimenti_banca, causing:
--   1. FK violation on INSERT (23503) because movimento_id values are in movimenti_banca, not movimenti_banca_old
--   2. PostgREST schema cache error: "Could not find a relationship between riconciliazione_log and movimenti_banca"

-- Step 1: Drop existing PK/unique on movimenti_banca.id if malformed, then re-add it cleanly.
-- First drop existing PK constraint by name if it exists
DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.movimenti_banca'::regclass
    AND contype = 'p';

  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.movimenti_banca DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

-- Re-add primary key explicitly
ALTER TABLE public.movimenti_banca ADD PRIMARY KEY (id);

-- Step 2: Drop the old FK constraint pointing to movimenti_banca_old
ALTER TABLE public.riconciliazione_log
  DROP CONSTRAINT IF EXISTS riconciliazione_log_movimento_id_fkey;

-- Step 3: Recreate FK pointing to the correct table
ALTER TABLE public.riconciliazione_log
  ADD CONSTRAINT riconciliazione_log_movimento_id_fkey
  FOREIGN KEY (movimento_id) REFERENCES public.movimenti_banca(id) ON DELETE CASCADE;

-- Step 4: Notify PostgREST to reload the schema cache
NOTIFY pgrst, 'reload schema';
