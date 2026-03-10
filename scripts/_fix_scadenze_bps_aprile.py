"""Fix scadenze BPS aprile: resetta a da_pagare le 2 scadenze rimaste pagato dopo rollback incompleto."""
import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
EXECUTE = "--execute" in sys.argv

SCADENZE_DA_FIX = [
    "1b935b07-f622-49a3-ae7a-a10d0dfa68c9",
    "6006af20-b470-46c9-bb56-e4268eef0486",
]

print("=== Fix scadenze BPS aprile ===\n")

for sid in SCADENZE_DA_FIX:
    r = sb.table("scadenze_pagamento") \
        .select("id, stato, importo_totale, importo_pagato, data_pagamento, data_scadenza, fattura_riferimento") \
        .eq("id", sid).execute().data
    if not r:
        print(f"  Scadenza {sid[:8]} non trovata!")
        continue
    s = r[0]
    print(f"  Scadenza {sid[:8]}...")
    print(f"    stato={s['stato']}  importo_totale={s.get('importo_totale')}  importo_pagato={s.get('importo_pagato')}")
    print(f"    data_scadenza={s.get('data_scadenza')}  data_pagamento={s.get('data_pagamento')}")

    if s['stato'] == 'da_pagare':
        print(f"    -> Gia da_pagare, skip")
        continue

    if EXECUTE:
        sb.table("scadenze_pagamento").update({
            "stato": "da_pagare",
            "importo_pagato": 0,
            "data_pagamento": None,
        }).eq("id", sid).execute()
        print(f"    -> OK: resettata a da_pagare")
    else:
        print(f"    -> (dry-run) resetterebbe a da_pagare")

if not EXECUTE:
    print(f"\nDRY-RUN. Esegui con --execute per applicare.")
else:
    print(f"\nFatto.")
