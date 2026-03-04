-- Step 1: Drop the old broken FK (pointed to movimenti_banca_old)
ALTER TABLE public.riconciliazione_log
  DROP CONSTRAINT IF EXISTS riconciliazione_log_movimento_id_fkey;

-- NOTE: We do NOT recreate the FK because movimenti_banca is a PARTITIONED TABLE
-- (partitioned by data_operazione). PostgreSQL requires the PK on a partitioned table
-- to include ALL partition key columns, so PRIMARY KEY (id) alone is forbidden.
-- A FK referencing only (id) is therefore structurally impossible.
-- Application-level joins are used instead (two-step query in data-fetcher.ts).

-- Step 3: Add PK (id, data_operazione) to movimenti_banca if not already present
DO $$
DECLARE
  pk_name text;
BEGIN
  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.movimenti_banca'::regclass
    AND contype = 'p';
  IF pk_name IS NULL THEN
    ALTER TABLE public.movimenti_banca ADD PRIMARY KEY (id, data_operazione);
  END IF;
END $$;

-- Step 4: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
