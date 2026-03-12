"""
Verifica le fonti delle scadenze collegate a fatture 2024
per distinguere quelle generate dallo script da quelle legittime.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

def safe_print(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

fatture = sb.table("fatture_fornitori").select("id").gte(
    "data_fattura", "2024-01-01").lte("data_fattura", "2024-12-31").execute().data or []
fattura_ids = {f["id"] for f in fatture}

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare"}

safe_print("=== SCADENZE COLLEGATE A FATTURE 2024 - DETTAGLIO FONTE ===\n")

per_fonte = {}
per_fonte_importo = {}

for fid in fattura_ids:
    scad = sb.table("scadenze_pagamento").select(
        "id, stato, importo_totale, importo_pagato, fonte, fattura_riferimento, data_emissione"
    ).eq("fattura_fornitore_id", fid).execute().data or []
    for s in scad:
        fonte = s.get("fonte") or "NULL"
        stato = s.get("stato", "?")
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        key = f"{fonte} / {stato}"
        per_fonte[key] = per_fonte.get(key, 0) + 1
        per_fonte_importo[key] = per_fonte_importo.get(key, 0) + residuo

safe_print(f"{'FONTE / STATO':<35} | {'COUNT':>6} | {'RESIDUO':>14}")
safe_print(f"{'-'*60}")
tot_n = 0
tot_imp = 0
for key in sorted(per_fonte.keys()):
    n = per_fonte[key]
    imp = per_fonte_importo[key]
    tot_n += n
    tot_imp += imp
    safe_print(f"  {key:<33} | {n:>6} | {imp:>14,.2f}")
safe_print(f"{'-'*60}")
safe_print(f"  {'TOTALE':<33} | {tot_n:>6} | {tot_imp:>14,.2f}")

safe_print("\n\n=== SCADENZE 2024 NON COLLEGATE A fattura_fornitore_id ===")
safe_print("(scadenze con data_emissione 2024, fonte diversa, senza FK)\n")

all_scad_2024 = sb.table("scadenze_pagamento").select(
    "id, stato, importo_totale, importo_pagato, fonte, fattura_riferimento, data_emissione, fattura_fornitore_id, soggetto_id"
).gte("data_emissione", "2024-01-01").lte("data_emissione", "2024-12-31").eq("tipo", "uscita").execute().data or []

non_collegate = [s for s in all_scad_2024 if not s.get("fattura_fornitore_id") or s["fattura_fornitore_id"] not in fattura_ids]

per_fonte2 = {}
per_fonte_importo2 = {}
for s in non_collegate:
    fonte = s.get("fonte") or "NULL"
    stato = s.get("stato", "?")
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    key = f"{fonte} / {stato}"
    per_fonte2[key] = per_fonte2.get(key, 0) + 1
    per_fonte_importo2[key] = per_fonte_importo2.get(key, 0) + residuo

safe_print(f"{'FONTE / STATO':<35} | {'COUNT':>6} | {'RESIDUO':>14}")
safe_print(f"{'-'*60}")
tot2_n = 0
tot2_imp = 0
for key in sorted(per_fonte2.keys()):
    n = per_fonte2[key]
    imp = per_fonte_importo2[key]
    tot2_n += n
    tot2_imp += imp
    safe_print(f"  {key:<33} | {n:>6} | {imp:>14,.2f}")
safe_print(f"{'-'*60}")
safe_print(f"  {'TOTALE':<33} | {tot2_n:>6} | {tot2_imp:>14,.2f}")

safe_print(f"\n\n=== RIEPILOGO ESPOSIZIONE USCITE APERTE (TUTTE) ===")
all_uscite = sb.table("scadenze_pagamento").select(
    "id, stato, importo_totale, importo_pagato, fonte, fattura_fornitore_id"
).eq("tipo", "uscita").in_("stato", ["da_pagare", "scaduta", "da_smistare"]).execute().data or []

collegate_2024 = [s for s in all_uscite if s.get("fattura_fornitore_id") in fattura_ids]
non_2024 = [s for s in all_uscite if s.get("fattura_fornitore_id") not in fattura_ids]

res_2024 = sum((s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0) for s in collegate_2024)
res_non = sum((s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0) for s in non_2024)

safe_print(f"Esposizione da scadenze collegate a fatture 2024:  EUR {res_2024:>12,.2f}  ({len(collegate_2024)} scadenze)")
safe_print(f"Esposizione da scadenze NON collegate a fatt.2024: EUR {res_non:>12,.2f}  ({len(non_2024)} scadenze)")
safe_print(f"TOTALE:                                             EUR {res_2024 + res_non:>12,.2f}")
safe_print(f"\nDopo rimozione scadenze 2024 -> EUR {res_non:,.2f}")
