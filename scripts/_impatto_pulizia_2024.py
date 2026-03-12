"""
Mostra l'impatto della pulizia: quanta esposizione verra' rimossa
eliminando le scadenze collegate alle fatture 2024.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

def safe_print(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

fatture = sb.table("fatture_fornitori").select(
    "id, numero_fattura, data_fattura, ragione_sociale, importo_totale"
).gte("data_fattura", "2024-01-01").lte("data_fattura", "2024-12-31").execute().data or []

fattura_ids = {f["id"] for f in fatture}
fattura_map = {f["id"]: f for f in fatture}

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare"}

esposizione_rimossa = {}
totale_rimosso = 0
n_scadenze_aperte = 0

for fid in fattura_ids:
    scad = sb.table("scadenze_pagamento").select(
        "id, stato, importo_totale, importo_pagato, soggetto_id"
    ).eq("fattura_fornitore_id", fid).execute().data or []

    for s in scad:
        if s["stato"] not in STATI_APERTI:
            continue
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        f = fattura_map[fid]
        nome = f.get("ragione_sociale", "?")
        if nome not in esposizione_rimossa:
            esposizione_rimossa[nome] = {"importo": 0, "n": 0}
        esposizione_rimossa[nome]["importo"] += residuo
        esposizione_rimossa[nome]["n"] += 1
        totale_rimosso += residuo
        n_scadenze_aperte += 1

safe_print(f"\n{'='*90}")
safe_print(f"ESPOSIZIONE CHE VERRA' RIMOSSA (scadenze aperte collegate a fatture 2024)")
safe_print(f"{'='*90}")
safe_print(f"{'FORNITORE':<50} | {'RIMOSSO':>12} | {'N.SCAD':>6}")
safe_print(f"{'-'*90}")

rows = sorted(esposizione_rimossa.items(), key=lambda x: -x[1]["importo"])
for nome, d in rows:
    safe_print(f"  {nome[:48]:<48} | {d['importo']:>12,.2f} | {d['n']:>6}")

safe_print(f"{'-'*90}")
safe_print(f"  {'TOTALE':<48} | {totale_rimosso:>12,.2f} | {n_scadenze_aperte:>6}")
safe_print(f"{'='*90}")
safe_print(f"\nDopo la pulizia l'esposizione scendera' di EUR {totale_rimosso:,.2f}")
