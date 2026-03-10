"""
_rollback_recovery.py — Rollback scadenze duplicate create oggi (10 marzo 2026).

PROBLEMA REALE:
  sync_excel_supabase.py usa UUID5(soggetto_id, fattura_norm, importo) come chiave.
  Se tra un run e l'altro la risoluzione fuzzy del fornitore cambia soggetto_id,
  lo stesso UUID5 diventa diverso → INSERT invece di UPDATE → record duplicato.
  Risultato: esposizione raddoppiata da ~524K a ~1.06M.

COSA ELIMINA:
  - Scadenze tipo='uscita' create OGGI con fonte='excel' o fonte=NULL
  - Scadenze tipo='uscita' create OGGI con fonte='fattura' (xml/recovery, non influenzano
    esposizione ma sono comunque duplicati da rimuovere)

COSA MANTIENE:
  - Tutti i record creati PRIMA di oggi (le scadenze corrette di ieri)
  - fonte='mutuo' (qualsiasi data — servono per cashflow)
  - fonte='manuale', 'titolo', 'verificato' (qualsiasi data)

Uso:
  python scripts/_rollback_recovery.py            # dry-run: mostra cosa verrebbe eliminato
  python scripts/_rollback_recovery.py --execute  # applica la cancellazione
"""

import os
import sys
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERRORE: variabili Supabase mancanti in .env.local")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
EXECUTE = "--execute" in sys.argv
OGGI = date.today().isoformat()  # "2026-03-10"

# Fonti da PROTEGGERE sempre (qualsiasi data)
FONTI_PROTETTE = {'mutuo', 'manuale', 'titolo', 'verificato'}


def main():
    print("=" * 65)
    print(f"  ROLLBACK DUPLICATI SCADENZE — {OGGI}")
    print(f"  Modalita: {'*** ESECUZIONE REALE ***' if EXECUTE else 'DRY-RUN (sicuro, nessuna modifica)'}")
    print("=" * 65)

    # --- 1. Fetch scadenze create OGGI ---
    print(f"\nFetch scadenze tipo='uscita' create oggi ({OGGI})...")
    r = sb.table("scadenze_pagamento") \
        .select("id, fonte, importo_totale, fattura_riferimento, soggetto_id, stato, created_at") \
        .eq("tipo", "uscita") \
        .gte("created_at", f"{OGGI}T00:00:00") \
        .execute()

    tutte_oggi = r.data
    print(f"  Trovate {len(tutte_oggi)} scadenze uscita create oggi.")

    # --- 2. Separa da mantenere e da eliminare ---
    da_mantenere = [s for s in tutte_oggi if s.get("fonte") in FONTI_PROTETTE]
    da_eliminare = [s for s in tutte_oggi if s.get("fonte") not in FONTI_PROTETTE]

    # Raggruppa per fonte
    by_fonte: dict[str, list] = {}
    for s in da_eliminare:
        f = s.get("fonte") or "NULL (excel)"
        by_fonte.setdefault(f, []).append(s)

    # --- 3. Report ---
    print(f"\n  MANTIENI — fonti protette (mutuo/manuale/titolo): {len(da_mantenere):>4} scadenze")
    print(f"  ELIMINA  — totale:                                {len(da_eliminare):>4} scadenze")
    for fonte, items in sorted(by_fonte.items()):
        importo_dp = sum(
            (s.get("importo_totale") or 0) for s in items if s.get("stato") == "da_pagare"
        )
        importo_tot = sum(s.get("importo_totale") or 0 for s in items)
        print(f"    fonte={fonte:<20}: {len(items):>4} righe   "
              f"importo totale: €{importo_tot:>12,.2f}   "
              f"di cui da_pagare: €{importo_dp:>12,.2f}")

    importo_da_pagare_elim = sum(
        (s.get("importo_totale") or 0) for s in da_eliminare if s.get("stato") == "da_pagare"
    )
    print(f"\n  Importo 'da_pagare' da rimuovere: €{importo_da_pagare_elim:,.2f}")

    # --- 4. Esposizione attuale vs stimata post-rollback ---
    print("\n  Calcolo esposizione attuale...")
    r2 = sb.table("scadenze_pagamento") \
        .select("importo_totale, importo_pagato") \
        .eq("tipo", "uscita") \
        .in_("stato", ["da_pagare", "scaduto"]) \
        .execute()

    esp_attuale = sum(
        (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        for s in r2.data
    )
    esp_post = esp_attuale - importo_da_pagare_elim

    print(f"  Esposizione ATTUALE:             €{esp_attuale:>12,.2f}")
    print(f"  Esposizione STIMATA post-rollback: €{esp_post:>12,.2f}")
    print(f"  (Target atteso: ~€524.000)")

    if not da_eliminare:
        print("\n  Nessuna scadenza da eliminare. Uscita.")
        return

    if not EXECUTE:
        print(f"\n  DRY-RUN completato — nessuna modifica effettuata.")
        print(f"  Per applicare: python scripts/_rollback_recovery.py --execute")
        return

    # --- 5. Esecuzione ---
    print(f"\n  Eliminazione {len(da_eliminare)} scadenze...")
    ids = [s["id"] for s in da_eliminare]
    deleted = 0
    for i in range(0, len(ids), 100):
        batch = ids[i:i + 100]
        sb.table("scadenze_pagamento").delete().in_("id", batch).execute()
        deleted += len(batch)
        print(f"  ... eliminati {deleted}/{len(ids)}")

    print(f"\n  COMPLETATO: {deleted} scadenze rimosse.")

    # --- 6. Verifica finale ---
    r3 = sb.table("scadenze_pagamento") \
        .select("importo_totale, importo_pagato") \
        .eq("tipo", "uscita") \
        .in_("stato", ["da_pagare", "scaduto"]) \
        .execute()

    esp_finale = sum(
        (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        for s in r3.data
    )
    print(f"\n  Esposizione FINALE: €{esp_finale:,.2f}")
    delta = abs(esp_finale - 524000)
    if delta < 30000:
        print(f"  OK — target ~€524K raggiunto (delta: €{delta:,.2f})")
    else:
        print(f"  ATTENZIONE — delta da €524K: €{delta:,.2f} — verifica consigliata")


if __name__ == "__main__":
    main()
