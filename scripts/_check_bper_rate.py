"""Check stato rate BPER"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

mutui = sb.table("mutui").select("id, banca_erogante").execute().data
bper = [m for m in mutui if 'BPER' in (m.get('banca_erogante') or '').upper()]
print(f"Mutuo BPER: {bper[0]['id'][:8]}")

rate = sb.table("rate_mutuo") \
    .select("id, numero_rata, importo_rata, data_scadenza, stato, data_pagamento, movimento_banca_id, importo_effettivo, scadenza_id") \
    .eq("mutuo_id", bper[0]['id']).order("numero_rata", desc=False).execute().data

for r in rate[:10]:
    mov = str(r.get('movimento_banca_id',''))[:8] if r.get('movimento_banca_id') else '-'
    scad = str(r.get('scadenza_id',''))[:8] if r.get('scadenza_id') else '-'
    print(f"  #{r['numero_rata']:>2} EUR {r['importo_rata']:>9} scad={r['data_scadenza'][:10]} stato={r['stato']:>10} pag={r.get('data_pagamento') or '-':>12} mov={mov} eff={r.get('importo_effettivo') or '-'} scad_id={scad}")
