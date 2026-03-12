# coding: utf-8
"""
Diagnosi mirata: cosa ha fatto il sync_excel_supabase.py?
Confronta fonte='excel' vs CSV target.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

def safe_print(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

def fetch_all(table, select, filters=None):
    all_data, offset = [], 0
    while True:
        q = sb.table(table).select(select).range(offset, offset + 999)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        r = q.execute()
        all_data.extend(r.data)
        if len(r.data) < 1000: break
        offset += 1000
    return all_data

# Carica
anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

scadenze = fetch_all("scadenze_pagamento",
    "id,soggetto_id,importo_totale,importo_pagato,stato,tipo,fonte,fattura_riferimento,data_scadenza,data_emissione")

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare", "scaduto", "parziale"}

# --- 1. Analisi per FONTE ---
safe_print("=== ESPOSIZIONE PER FONTE ===")
per_fonte = {}
for s in scadenze:
    if s.get("tipo") != "uscita": continue
    if s.get("stato") not in STATI_APERTI: continue
    fonte = s.get("fonte") or "null"
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    if fonte not in per_fonte:
        per_fonte[fonte] = {"count": 0, "importo": 0}
    per_fonte[fonte]["count"] += 1
    per_fonte[fonte]["importo"] += residuo

for fonte, d in sorted(per_fonte.items(), key=lambda x: -x[1]["importo"]):
    safe_print(f"  {fonte:<14} : {d['count']:>4} scadenze, EUR {d['importo']:>12,.2f}")

totale = sum(d["importo"] for d in per_fonte.values())
safe_print(f"  {'TOTALE':<14} : EUR {totale:>12,.2f}")

# --- 2. Dettaglio fonte='excel' per fornitore (aperte) ---
safe_print(f"\n=== DETTAGLIO FONTE='EXCEL' (APERTE) ===")
excel_aperte = {}
for s in scadenze:
    if s.get("tipo") != "uscita": continue
    if s.get("fonte") != "excel": continue
    if s.get("stato") not in STATI_APERTI: continue
    sid = s.get("soggetto_id")
    nome = anag_map.get(sid, "?").lower().strip()
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    if nome not in excel_aperte:
        excel_aperte[nome] = {"count": 0, "importo": 0, "scadenze": []}
    excel_aperte[nome]["count"] += 1
    excel_aperte[nome]["importo"] += residuo
    excel_aperte[nome]["scadenze"].append(s)

safe_print(f"{'FORNITORE':<50} | {'N':>4} | {'RESIDUO':>12}")
safe_print(f"{'-'*75}")
for nome, d in sorted(excel_aperte.items(), key=lambda x: -x[1]["importo"]):
    safe_print(f"  {nome[:48]:<48} | {d['count']:>4} | {d['importo']:>12,.2f}")

tot_excel = sum(d["importo"] for d in excel_aperte.values())
safe_print(f"{'-'*75}")
safe_print(f"  {'TOTALE FONTE EXCEL':<48} | {sum(d['count'] for d in excel_aperte.values()):>4} | {tot_excel:>12,.2f}")

# --- 3. Dettaglio fonte='null' (aperte) ---
safe_print(f"\n=== DETTAGLIO FONTE=NULL (APERTE) ===")
null_aperte = {}
for s in scadenze:
    if s.get("tipo") != "uscita": continue
    if s.get("fonte") is not None: continue
    if s.get("stato") not in STATI_APERTI: continue
    sid = s.get("soggetto_id")
    nome = anag_map.get(sid, "?").lower().strip()
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    if nome not in null_aperte:
        null_aperte[nome] = {"count": 0, "importo": 0}
    null_aperte[nome]["count"] += 1
    null_aperte[nome]["importo"] += residuo

safe_print(f"{'FORNITORE':<50} | {'N':>4} | {'RESIDUO':>12}")
safe_print(f"{'-'*75}")
for nome, d in sorted(null_aperte.items(), key=lambda x: -x[1]["importo"]):
    safe_print(f"  {nome[:48]:<48} | {d['count']:>4} | {d['importo']:>12,.2f}")

tot_null = sum(d["importo"] for d in null_aperte.values())
safe_print(f"{'-'*75}")
safe_print(f"  {'TOTALE FONTE NULL':<48} | {sum(d['count'] for d in null_aperte.values()):>4} | {tot_null:>12,.2f}")

# --- 4. Dettaglio fonte='mutuo' (aperte) ---
safe_print(f"\n=== DETTAGLIO FONTE='MUTUO' (APERTE) ===")
mutuo_aperte = {}
for s in scadenze:
    if s.get("tipo") != "uscita": continue
    if s.get("fonte") != "mutuo": continue
    if s.get("stato") not in STATI_APERTI: continue
    sid = s.get("soggetto_id")
    nome = anag_map.get(sid, "?").lower().strip()
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    if nome not in mutuo_aperte:
        mutuo_aperte[nome] = {"count": 0, "importo": 0}
    mutuo_aperte[nome]["count"] += 1
    mutuo_aperte[nome]["importo"] += residuo

for nome, d in sorted(mutuo_aperte.items(), key=lambda x: -x[1]["importo"]):
    safe_print(f"  {nome[:48]:<48} | {d['count']:>4} | {d['importo']:>12,.2f}")

# --- 5. "?" soggetto: dettaglio ---
safe_print(f"\n=== DETTAGLIO SOGGETTO '?' ===")
for s in scadenze:
    if s.get("tipo") != "uscita": continue
    sid = s.get("soggetto_id")
    nome = anag_map.get(sid, "?")
    if nome == "?":
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        if s.get("stato") in STATI_APERTI:
            safe_print(f"  id={s['id'][:12]}.. soggetto_id={sid or 'NULL'} fonte={s.get('fonte')} stato={s.get('stato')} importo={s.get('importo_totale')} fatt={s.get('fattura_riferimento','')[:30]}")
