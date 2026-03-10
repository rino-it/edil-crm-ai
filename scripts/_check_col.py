"""Applica ALTER TABLE via psycopg2 o via Supabase Management API"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Approach: Try inserting a row with conto_banca_id to see if column exists
# If not, we need to add it via Dashboard or psql

# Test if column exists by selecting it
try:
    r = sb.table('scadenze_pagamento').select('conto_banca_id').limit(1).execute()
    print("conto_banca_id column EXISTS already!")
    print(f"  Value: {r.data}")
except Exception as e:
    print(f"conto_banca_id column DOES NOT EXIST: {e}")
    print("\n==> You need to run this SQL in the Supabase Dashboard SQL Editor:")
    print("""
ALTER TABLE public.scadenze_pagamento
ADD COLUMN IF NOT EXISTS conto_banca_id uuid REFERENCES public.conti_banca(id);

CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca
ON public.scadenze_pagamento(conto_banca_id)
WHERE conto_banca_id IS NOT NULL;
""")
