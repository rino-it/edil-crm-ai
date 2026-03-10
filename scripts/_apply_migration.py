"""Applica la migration: aggiunge conto_banca_id a scadenze_pagamento"""
import os, requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

sql = """
ALTER TABLE public.scadenze_pagamento
ADD COLUMN IF NOT EXISTS conto_banca_id uuid REFERENCES public.conti_banca(id);

CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca
ON public.scadenze_pagamento(conto_banca_id)
WHERE conto_banca_id IS NOT NULL;
"""

# Execute via Supabase REST SQL endpoint
resp = requests.post(
    f"{url}/rest/v1/rpc/exec_sql",
    json={"query": sql},
    headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
)
print(f"Status: {resp.status_code}")
print(resp.text)
