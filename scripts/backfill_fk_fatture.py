"""
Script una-tantum: backfill fattura_fornitore_id su scadenze_pagamento.

Popola la FK verso fatture_fornitori sulle scadenze esistenti, usando la stessa
logica di normalizzazione di crea_scadenze_orfane.py per gestire differenze tra
numeri fattura (zeri iniziali, spazi, suffissi).

Prerequisito: applicare la migrazione 20260311_fattura_fk_ddt.sql prima di eseguire.

Uso:
  python scripts/backfill_fk_fatture.py [--dry-run]
"""

import os
import re
import sys
from datetime import datetime

try:
    from supabase import create_client
except ImportError:
    print("supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_script_dir, "..")
load_dotenv(os.path.join(_project_root, ".env.local"))
load_dotenv(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Variabili d'ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = "--dry-run" in sys.argv


def normalize_fattura_nr(nr: str) -> str:
    """Normalizza numero fattura per matching: strip leading zeros, spazi, lowercase."""
    if not nr:
        return ""
    nr = nr.strip().lower()
    nr = re.sub(r'^0+', '', nr)
    nr = nr.replace(' ', '')
    return nr


def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] Backfill fattura_fornitore_id su scadenze_pagamento")
    if DRY_RUN:
        print("  MODO DRY-RUN: nessuna scrittura su DB")

    # 1. Carica scadenze senza FK
    scadenze_raw = []
    offset = 0
    while True:
        batch = supabase.table("scadenze_pagamento") \
            .select("id, fattura_riferimento, soggetto_id, data_emissione") \
            .is_("fattura_fornitore_id", "null") \
            .eq("fonte", "fattura") \
            .range(offset, offset + 999) \
            .execute()
        scadenze_raw.extend(batch.data or [])
        if not batch.data or len(batch.data) < 1000:
            break
        offset += 1000

    print(f"  Scadenze senza FK: {len(scadenze_raw)}")
    if not scadenze_raw:
        print("  Nessuna scadenza da aggiornare.")
        return

    # 2. Carica fatture fornitori
    fatture_raw = []
    offset = 0
    while True:
        batch = supabase.table("fatture_fornitori") \
            .select("id, numero_fattura, soggetto_id, data_fattura") \
            .range(offset, offset + 999) \
            .execute()
        fatture_raw.extend(batch.data or [])
        if not batch.data or len(batch.data) < 1000:
            break
        offset += 1000

    print(f"  Fatture fornitori caricate: {len(fatture_raw)}")

    # 3. Costruisci indice: (soggetto_id, data_fattura, numero_normalizzato) -> fattura_id
    fattura_index = {}
    for f in fatture_raw:
        key = (
            f["soggetto_id"],
            f["data_fattura"],
            normalize_fattura_nr(f["numero_fattura"])
        )
        fattura_index[key] = f["id"]

    # 4. Match e aggiorna
    matched = 0
    unmatched = 0

    for s in scadenze_raw:
        key = (
            s["soggetto_id"],
            s["data_emissione"],
            normalize_fattura_nr(s["fattura_riferimento"])
        )
        fattura_id = fattura_index.get(key)

        if fattura_id:
            matched += 1
            if not DRY_RUN:
                supabase.table("scadenze_pagamento") \
                    .update({"fattura_fornitore_id": fattura_id}) \
                    .eq("id", s["id"]) \
                    .execute()
        else:
            unmatched += 1
            if unmatched <= 20:
                print(f"  NO MATCH: fatt={s['fattura_riferimento']!r} del {s['data_emissione']} sogg={s['soggetto_id'][:8]}...")

    print(f"\n  Risultato:")
    print(f"    Matchati:     {matched}")
    print(f"    Non matchati: {unmatched}")
    if DRY_RUN:
        print(f"    (dry-run, nessun UPDATE eseguito)")


if __name__ == "__main__":
    main()
