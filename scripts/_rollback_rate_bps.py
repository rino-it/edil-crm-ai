"""Rollback: riporta a da_pagare le rate BPS di aprile erroneamente segnate come pagate."""
import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
EXECUTE = "--execute" in sys.argv

# Trova mutui BPS
mutui = sb.table("mutui").select("id, banca_erogante, scopo").execute().data
bps_ids = [m['id'] for m in mutui if m.get('banca_erogante', '').upper() != 'BPER']

print(f"Mutui BPS: {len(bps_ids)}")

# Trova rate BPS di APRILE 2026 segnate come pagate (queste sono l'errore)
rate_da_rollback = []
for mid in bps_ids:
    r = sb.table("rate_mutuo") \
        .select("id, numero_rata, importo_rata, data_scadenza, stato, data_pagamento, scadenza_id, movimento_banca_id") \
        .eq("mutuo_id", mid) \
        .eq("stato", "pagato") \
        .gte("data_scadenza", "2026-04-01") \
        .lte("data_scadenza", "2026-04-30") \
        .execute().data
    rate_da_rollback.extend(r)

print(f"\nRate BPS aprile pagate da rollback: {len(rate_da_rollback)}")
for r in rate_da_rollback:
    print(f"  #{r['numero_rata']} €{r['importo_rata']} scad {r['data_scadenza']} — pagamento: {r.get('data_pagamento')} — mov: {str(r.get('movimento_banca_id',''))[:8]}")

if not rate_da_rollback:
    print("\nNessuna rata da rollback.")
    sys.exit(0)

if not EXECUTE:
    print(f"\nDRY-RUN. Esegui con --execute per applicare.")
    sys.exit(0)

for r in rate_da_rollback:
    sb.table("rate_mutuo").update({
        "stato": "da_pagare",
        "data_pagamento": None,
        "movimento_banca_id": None,
        "importo_effettivo": None,
    }).eq("id", r['id']).execute()
    print(f"  OK: Rata #{r['numero_rata']} -> da_pagare")

    if r.get('scadenza_id'):
        sb.table("scadenze_pagamento").update({
            "stato": "da_pagare",
            "importo_pagato": 0,
            "data_pagamento": None,
        }).eq("id", r['scadenza_id']).execute()
        print(f"  OK: Scadenza -> da_pagare")

    if r.get('movimento_banca_id'):
        sb.table("movimenti_banca").update({
            "stato_riconciliazione": "non_riconciliato",
            "scadenza_id": None,
            "categoria_dedotta": None,
        }).eq("id", r['movimento_banca_id']).execute()
        print(f"  OK: Movimento -> non_riconciliato")

print(f"\n{len(rate_da_rollback)} rate BPS aprile ripristinate.")
