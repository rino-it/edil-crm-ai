# coding: utf-8
"""
Rimuove duplicati cross-fonte: scadenze con stessa fattura+importo+soggetto
che esistono sia con fonte='excel' sia con fonte=null/verificato.

Regola: se una scadenza esiste con fonte non-excel (null, verificato),
la versione fonte='excel' e' ridondante -> viene chiusa (stato=pagato).
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

DRY_RUN = "--execute" not in sys.argv

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

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare", "scaduto", "parziale"}

def main():
    mode = "DRY RUN" if DRY_RUN else "ESECUZIONE"
    safe_print(f"=== FIX DUPLICATI CROSS-FONTE - {mode} ===\n")

    scadenze = fetch_all("scadenze_pagamento",
        "id,soggetto_id,importo_totale,importo_pagato,stato,tipo,fonte,fattura_riferimento,data_scadenza,data_emissione")
    anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
    anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

    # Filtra solo uscite aperte
    aperte = [s for s in scadenze if s.get("tipo") == "uscita" and s.get("stato") in STATI_APERTI]

    # Raggruppa per chiave (soggetto_id, fattura_riferimento, importo_totale)
    gruppi = {}
    for s in aperte:
        k = (
            s.get("soggetto_id"),
            s.get("fattura_riferimento"),
            round(float(s.get("importo_totale") or 0), 2),
        )
        if k not in gruppi:
            gruppi[k] = []
        gruppi[k].append(s)

    da_chiudere = []

    for k, lista in gruppi.items():
        if len(lista) < 2:
            continue

        fonti = set(s.get("fonte") for s in lista)
        # Se ci sono sia excel che non-excel, chiudi quelli excel
        ha_non_excel = any(f != "excel" for f in fonti)
        ha_excel = "excel" in fonti

        if ha_non_excel and ha_excel:
            sid = k[0]
            nome = anag_map.get(sid, "?")
            for s in lista:
                if s.get("fonte") == "excel":
                    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
                    da_chiudere.append(s)
                    safe_print(f"  DUP: {nome[:40]:<40} fatt={s.get('fattura_riferimento','')[:20]:<20} EUR {residuo:>10,.2f} (fonte=excel -> chiudo)")

    if not da_chiudere:
        safe_print("  Nessun duplicato cross-fonte trovato.")
        return

    tot = sum((s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0) for s in da_chiudere)
    safe_print(f"\n  Duplicati da chiudere: {len(da_chiudere)}")
    safe_print(f"  Esposizione rimossa : EUR {tot:,.2f}")

    if DRY_RUN:
        safe_print(f"\n  Per eseguire: python _fix_duplicati_cross_fonte.py --execute")
        return

    for s in da_chiudere:
        sb.table("scadenze_pagamento").update({
            "stato": "pagato",
            "importo_pagato": s.get("importo_totale") or 0,
        }).eq("id", s["id"]).execute()

    safe_print(f"\n  Completato: {len(da_chiudere)} duplicati chiusi.")


if __name__ == "__main__":
    main()
