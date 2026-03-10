# coding: utf-8
"""Confronta esposizione DB attuale vs CSV di riferimento."""
import csv
import os
from collections import defaultdict

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="../.env.local")
sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

# 1. Query tutte le scadenze non-pagate uscita dal DB
PAGE = 1000
rows = []
offset = 0
while True:
    res = (
        sb.table("scadenze_pagamento")
        .select("importo_totale,importo_pagato,stato,soggetto_id,anagrafica_soggetti(ragione_sociale),descrizione")
        .eq("tipo", "uscita")
        .in_("stato", ["da_pagare", "scaduto", "parziale", "da_smistare"])
        .range(offset, offset + PAGE - 1)
        .execute()
    )
    rows.extend(res.data)
    if len(res.data) < PAGE:
        break
    offset += PAGE

print(f"Totale scadenze non-pagate uscita nel DB: {len(rows)}")

# 2. Raggruppamento per fornitore
by_fornitore = defaultdict(lambda: {"n": 0, "residuo": 0.0, "da_pagare": 0.0, "scaduto": 0.0, "parziale": 0.0, "da_smistare": 0.0})
for r in rows:
    nome = (r.get("anagrafica_soggetti") or {}).get("ragione_sociale") or r.get("descrizione") or "N/D"
    residuo = float(r["importo_totale"] or 0) - float(r["importo_pagato"] or 0)
    by_fornitore[nome]["n"] += 1
    by_fornitore[nome]["residuo"] += residuo
    by_fornitore[nome][r["stato"]] += residuo

# 3. Leggi CSV di riferimento
csv_data = {}
with open("_esposizione_live.csv", "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row["fornitore"] != "TOTALE":
            csv_data[row["fornitore"]] = float(row["totale_residuo_webapp"])

# 4. Confronto - mostra solo differenze
total_db = 0.0
total_csv = sum(csv_data.values())

print(f"\n{'FORNITORE':<55} {'DB':>12} {'CSV':>12} {'DELTA':>12} {'N':>4}")
print("-" * 100)

for nome, data in sorted(by_fornitore.items(), key=lambda x: -x[1]["residuo"]):
    csv_val = csv_data.get(nome)
    delta = data["residuo"] - (csv_val if csv_val is not None else 0)
    marker = " [NEW]" if csv_val is None else ""
    if abs(delta) > 0.01 or csv_val is None:
        cv = csv_val if csv_val is not None else 0
        print(f"{nome[:54]:<55} {data['residuo']:>12,.2f} {cv:>12,.2f} {delta:>+12,.2f} {data['n']:>4}{marker}")
    total_db += data["residuo"]

# Voci nel CSV ma non nel DB
for nome, val in csv_data.items():
    if nome not in by_fornitore:
        print(f"{nome[:54]:<55} {'0.00':>12} {val:>12,.2f} {-val:>+12,.2f}    0 [MISSING]")

print("-" * 100)
print(f"{'TOTALE DB':>55} {total_db:>12,.2f}")
print(f"{'TOTALE CSV':>55} {total_csv:>12,.2f}")
print(f"{'DELTA (DB - CSV)':>55} {total_db - total_csv:>+12,.2f}")
print(f"{'SCADENZE DB':>55} {len(rows):>12}")
print(f"{'FORNITORI DB':>55} {len(by_fornitore):>12}")
