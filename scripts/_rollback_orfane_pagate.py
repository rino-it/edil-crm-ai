"""Rollback: elimina le scadenze orfane create come 'pagato' per errore dal script crea_scadenze_orfane.

Criterio: fonte='fattura', stato='pagato', tipo='uscita', data_pagamento IS NULL
(le orfane create dallo script NON hanno data_pagamento, a differenza di quelle pagate veramente)
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
EXECUTE = "--execute" in sys.argv

print("=== Rollback scadenze orfane create come pagate ===\n")

# Fetch tutte le scadenze fonte=fattura, stato=pagato, tipo=uscita
all_data, offset = [], 0
while True:
    batch = sb.table("scadenze_pagamento") \
        .select("id, fattura_riferimento, importo_totale, importo_pagato, stato, fonte, data_emissione, data_pagamento, data_scadenza") \
        .eq("fonte", "fattura") \
        .eq("stato", "pagato") \
        .eq("tipo", "uscita") \
        .range(offset, offset + 999) \
        .execute().data or []
    all_data.extend(batch)
    if len(batch) < 1000:
        break
    offset += 1000

print(f"Totale scadenze fonte=fattura, stato=pagato, tipo=uscita: {len(all_data)}")

# Le orfane create dallo script hanno importo_pagato == importo_totale e data_pagamento == NULL
# (lo script non settava data_pagamento)
da_eliminare = [s for s in all_data if s.get('data_pagamento') is None]
con_pagamento = [s for s in all_data if s.get('data_pagamento') is not None]

print(f"  Con data_pagamento (probabilmente OK): {len(con_pagamento)}")
print(f"  SENZA data_pagamento (create da script): {len(da_eliminare)}")

if not da_eliminare:
    print("\nNessuna scadenza da eliminare.")
    sys.exit(0)

totale = sum(s.get('importo_totale', 0) or 0 for s in da_eliminare)
print(f"\nImporto totale da eliminare: EUR {totale:,.2f}")
print(f"Prime 10:")
for s in da_eliminare[:10]:
    print(f"  {s.get('fattura_riferimento','-'):>20} EUR {s.get('importo_totale',0):>10} em={s.get('data_emissione','-')} scad={s.get('data_scadenza','-')}")

if not EXECUTE:
    print(f"\nDRY-RUN. Esegui con --execute per ELIMINARE queste {len(da_eliminare)} scadenze.")
    sys.exit(0)

print(f"\nEliminazione {len(da_eliminare)} scadenze...")
deleted = 0
for s in da_eliminare:
    sb.table("scadenze_pagamento").delete().eq("id", s['id']).execute()
    deleted += 1
    if deleted % 20 == 0:
        print(f"  ... {deleted}/{len(da_eliminare)}")

print(f"\nELIMINATE {deleted} scadenze orfane errate.")
print("Ora ri-esegui: python scripts/crea_scadenze_orfane.py --execute")
