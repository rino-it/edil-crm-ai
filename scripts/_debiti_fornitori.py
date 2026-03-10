"""
_debiti_fornitori.py — CSV debiti aperti verso fornitori.

Replica ESATTA della query della webapp (pagina /finanza/da-pagare):
  - tipo = 'uscita'
  - stato IN ('da_pagare', 'parziale', 'scaduto')
  - nessun filtro sulla fonte

Output: debiti_fornitori_YYYY-MM-DD.csv nella cartella scripts/
        Separatore ; — apribile direttamente in Excel.

Uso:
  python scripts/_debiti_fornitori.py
"""

import os
import csv
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
OGGI = date.today().isoformat()
OUT_FILE = os.path.join(os.path.dirname(__file__), f"debiti_fornitori_{OGGI}.csv")


def fetch_paged(build_query, page_size=1000):
    results, offset = [], 0
    while True:
        batch = build_query(offset, offset + page_size - 1).execute().data or []
        results.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return results


def main():
    print("=" * 65)
    print(f"  DEBITI FORNITORI APERTI — {OGGI}")
    print(f"  (replica query webapp: tipo=uscita, stato=da_pagare/parziale/scaduto)")
    print("=" * 65)

    # Stessa query della webapp /finanza/da-pagare
    tutti = fetch_paged(
        lambda lo, hi: sb.table("scadenze_pagamento")
            .select(
                "id, fattura_riferimento, importo_totale, importo_pagato, "
                "data_scadenza, data_emissione, stato, fonte, soggetto_id, "
                "descrizione, anagrafica_soggetti(ragione_sociale, partita_iva)"
            )
            .eq("tipo", "uscita")
            .in_("stato", ["da_pagare", "parziale", "scaduto"])
            .order("data_scadenza", desc=False)
            .range(lo, hi)
    )

    print(f"\n  Scadenze recuperate: {len(tutti)}")

    righe = []
    for s in tutti:
        importo_totale = float(s.get("importo_totale") or 0)
        importo_pagato = float(s.get("importo_pagato") or 0)
        residuo = round(importo_totale - importo_pagato, 2)
        if residuo <= 0:
            continue

        sog = s.get("anagrafica_soggetti") or {}
        fornitore = sog.get("ragione_sociale") or "— soggetto sconosciuto —"
        piva      = sog.get("partita_iva") or ""

        righe.append({
            "Fornitore":       fornitore,
            "P.IVA":           piva,
            "Fattura":         s.get("fattura_riferimento") or "",
            "Descrizione":     s.get("descrizione") or "",
            "Data Emissione":  s.get("data_emissione") or "",
            "Data Scadenza":   s.get("data_scadenza") or "",
            "Importo Totale":  f"{importo_totale:.2f}",
            "Importo Pagato":  f"{importo_pagato:.2f}",
            "Residuo":         f"{residuo:.2f}",
            "Stato":           s.get("stato") or "",
            "Fonte":           s.get("fonte") or "NULL",
        })

    # Scaduto prima, poi per data
    righe.sort(key=lambda r: (0 if r["Stato"] == "scaduto" else 1, r["Data Scadenza"]))

    totale      = sum(float(r["Residuo"]) for r in righe)
    tot_scaduto = sum(float(r["Residuo"]) for r in righe if r["Stato"] == "scaduto")
    tot_parziale = sum(float(r["Residuo"]) for r in righe if r["Stato"] == "parziale")

    print(f"  Righe con residuo > 0:   {len(righe)}")
    print(f"  Totale residuo:          €{totale:>12,.2f}")
    print(f"    di cui scaduto:        €{tot_scaduto:>12,.2f}")
    print(f"    di cui parziale:       €{tot_parziale:>12,.2f}")

    if not righe:
        print("\n  Nessun debito aperto trovato.")
        return

    # ── CSV ────────────────────────────────────────────────────
    fieldnames = [
        "Fornitore", "P.IVA", "Fattura", "Descrizione",
        "Data Emissione", "Data Scadenza",
        "Importo Totale", "Importo Pagato", "Residuo",
        "Stato", "Fonte",
    ]
    with open(OUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        w.writeheader()
        w.writerows(righe)
        w.writerow({k: "" for k in fieldnames} | {"Fornitore": "TOTALE", "Residuo": f"{totale:.2f}"})

    print(f"\n  CSV → {OUT_FILE}")

    # ── Riepilogo per fornitore ────────────────────────────────
    per_fornitore: dict[str, float] = {}
    for r in righe:
        per_fornitore[r["Fornitore"]] = per_fornitore.get(r["Fornitore"], 0.0) + float(r["Residuo"])

    print(f"\n  {'Fornitore':<45}  {'N':>4}  {'Residuo':>12}")
    print(f"  {'-'*45}  {'-'*4}  {'-'*12}")
    conteggi = {r["Fornitore"]: conteggi.get(r["Fornitore"], 0) + 1 for r in righe for conteggi in [{}]}
    # rebuild counts properly
    cnt: dict[str, int] = {}
    for r in righe:
        cnt[r["Fornitore"]] = cnt.get(r["Fornitore"], 0) + 1

    for nome, tot in sorted(per_fornitore.items(), key=lambda x: -x[1]):
        print(f"  {nome:<45}  {cnt[nome]:>4}  €{tot:>11,.2f}")
    print(f"  {'='*45}  {'='*4}  {'='*12}")
    print(f"  {'TOTALE':<45}  {len(righe):>4}  €{totale:>11,.2f}")


if __name__ == "__main__":
    main()
