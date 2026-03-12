# coding: utf-8
"""
Pulizia assegnazioni cantiere Vertova errate.

Resetta cantiere_id = NULL sulle scadenze assegnate a Vertova
dal sync (fonte='excel'), lasciando intatte quelle manuali.
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


def main():
    mode = "DRY RUN" if DRY_RUN else "ESECUZIONE"
    safe_print(f"=== PULIZIA VERTOVA - {mode} ===\n")

    # Trova cantiere Vertova
    res = sb.table("cantieri").select("id, nome, codice").ilike("nome", "%vertova%").execute()
    if not res.data:
        safe_print("Cantiere 'Vertova' non trovato in DB.")
        return

    for c in res.data:
        safe_print(f"Cantiere trovato: {c['nome']} (codice={c.get('codice')}) -> {c['id']}")

    vertova_ids = [c["id"] for c in res.data]

    # Trova tutte le scadenze assegnate a Vertova
    totale = 0
    da_resettare = []

    for vid in vertova_ids:
        scadenze = fetch_all("scadenze_pagamento",
            "id,soggetto_id,fattura_riferimento,importo_totale,stato,fonte,cantiere_id",
            {"cantiere_id": vid})

        safe_print(f"\nScadenze assegnate a {vid}: {len(scadenze)}")

        per_fonte = {}
        for s in scadenze:
            fonte = s.get("fonte") or "null"
            per_fonte[fonte] = per_fonte.get(fonte, 0) + 1

        for fonte, n in sorted(per_fonte.items()):
            safe_print(f"  fonte={fonte}: {n}")

        # Resetta solo fonte='excel' (assegnate dal sync)
        for s in scadenze:
            if s.get("fonte") == "excel":
                da_resettare.append(s)
                totale += 1

    # Carica anagrafica per nomi
    anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
    anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

    safe_print(f"\n{'='*60}")
    safe_print(f"  Scadenze da resettare (fonte=excel): {len(da_resettare)}")
    safe_print(f"{'='*60}")

    if da_resettare:
        safe_print(f"\n  Dettaglio (prime 20):")
        for s in da_resettare[:20]:
            nome = anag_map.get(s.get("soggetto_id"), "?")
            fatt = s.get("fattura_riferimento") or ""
            safe_print(f"    {nome[:35]:<35} fatt={fatt[:20]:<20} stato={s.get('stato')}")
        if len(da_resettare) > 20:
            safe_print(f"    ... +{len(da_resettare) - 20} altri")

    if DRY_RUN:
        safe_print(f"\n  Per eseguire: python _fix_vertova_assignments.py --execute")
        return

    for s in da_resettare:
        sb.table("scadenze_pagamento").update({"cantiere_id": None}).eq("id", s["id"]).execute()

    safe_print(f"\n  Completato: {len(da_resettare)} scadenze resettate (cantiere_id = NULL)")


if __name__ == "__main__":
    main()
