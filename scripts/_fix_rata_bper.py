"""
Fix rata 5 mutuo BPER — segna come pagata e collega al movimento banca riconciliato.

Uso:
  python scripts/_fix_rata_bper.py            # dry-run
  python scripts/_fix_rata_bper.py --execute  # applica
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
EXECUTE = "--execute" in sys.argv


def main():
    print("=" * 70)
    print(f"  FIX RATA MUTUO BPER")
    print(f"  Modalita: {'ESECUZIONE' if EXECUTE else 'DRY-RUN'}")
    print("=" * 70)

    # 1. Trova tutti i mutui BPER
    mutui = sb.table("mutui").select("id, banca_erogante, scopo, capitale_erogato").execute().data
    print(f"\n  Mutui trovati: {len(mutui)}")
    for m in mutui:
        print(f"    {m['id'][:8]}... — {m.get('banca_erogante','')} — {m.get('scopo','')} — capitale: {m.get('capitale_erogato')}")

    # 2. Filtra SOLO mutui BPER
    bper_ids = [m['id'] for m in mutui if 'BPER' in (m.get('banca_erogante') or '').upper()]
    print(f"\n  Mutui BPER: {len(bper_ids)}")
    if not bper_ids:
        print("  Nessun mutuo BPER trovato!")
        return

    # 3. Trova rate da_pagare SOLO per mutui BPER
    rate_aperte = []
    for mid in bper_ids:
        r = sb.table("rate_mutuo") \
            .select("id, mutuo_id, numero_rata, importo_rata, data_scadenza, stato, scadenza_id, movimento_banca_id") \
            .eq("mutuo_id", mid) \
            .eq("stato", "da_pagare") \
            .order("numero_rata", desc=False) \
            .execute().data
        rate_aperte.extend(r)

    print(f"  Rate BPER da_pagare: {len(rate_aperte)}")
    for r in rate_aperte[:5]:
        print(f"    #{r['numero_rata']} EUR {r['importo_rata']} ({r['data_scadenza'][:10]})")

    # 3. Cerca movimenti bancari riconciliati con "RATA FINANZIAMENTO" o "RATA MUTUO"
    movimenti = sb.table("movimenti_banca") \
        .select("id, descrizione, importo, data_operazione, data_valuta, stato_riconciliazione, scadenza_id") \
        .or_("descrizione.ilike.%rata finanziamento%,descrizione.ilike.%rata mutuo%") \
        .order("data_operazione", desc=False) \
        .execute().data

    print(f"\n  Movimenti 'rata finanziamento/mutuo' trovati: {len(movimenti)}")
    for mv in movimenti:
        print(f"    {mv['data_operazione']} | {mv['descrizione'][:50]} | €{mv['importo']} | stato: {mv['stato_riconciliazione']} | scadenza: {mv.get('scadenza_id', '-')}")

    # 4. Per ogni movimento rata, cerca la rate_mutuo corrispondente
    from datetime import datetime
    fix_count = 0
    for mv in movimenti:
        importo_abs = abs(mv['importo'])
        data_mov = mv['data_operazione'] or mv.get('data_valuta', '')

        print(f"\n  Cerco match per: €{importo_abs} del {data_mov}")

        # Trova la rata più vicina per importo (tolleranza 50€) e data (+-30gg)
        best = None
        best_diff = 999999
        for rata in rate_aperte:
            diff_importo = abs(rata['importo_rata'] - importo_abs)
            if diff_importo > 100.0:
                continue
            try:
                d_mov = datetime.strptime(data_mov[:10], "%Y-%m-%d")
                d_rata = datetime.strptime(rata['data_scadenza'][:10], "%Y-%m-%d")
                if abs((d_mov - d_rata).days) > 30:
                    continue
            except:
                continue
            if diff_importo < best_diff:
                best = rata
                best_diff = diff_importo

        if not best:
            # Mostra le rate più vicine per importo per debug
            vicine = sorted(rate_aperte, key=lambda r: abs(r['importo_rata'] - importo_abs))[:3]
            print(f"    XX Nessun match. Rate più vicine per importo:")
            for r in vicine:
                delta = abs(r['importo_rata'] - importo_abs)
                print(f"       #{r['numero_rata']} €{r['importo_rata']} ({r['data_scadenza'][:10]}) — delta: €{delta:.2f}")
            continue

        rata = best
        delta = abs(rata['importo_rata'] - importo_abs)
        print(f"  MATCH TROVATO (delta €{delta:.2f}):")
        print(f"    Movimento: {mv['data_operazione']} | {mv['descrizione'][:50]} | €{mv['importo']}")
        print(f"    Rata:      #{rata['numero_rata']} | scadenza {rata['data_scadenza']} | €{rata['importo_rata']}")
        print(f"    Scadenza collegata: {rata.get('scadenza_id') or 'NESSUNA'}")

        if EXECUTE:
            sb.table("rate_mutuo").update({
                "stato": "pagato",
                "data_pagamento": data_mov[:10],
                "movimento_banca_id": mv['id'],
                "importo_effettivo": importo_abs,
                "importo_rata": importo_abs,
            }).eq("id", rata['id']).execute()
            print(f"    OK: Rata #{rata['numero_rata']} -> pagato (effettivo: €{importo_abs}, preventivo: €{rata['importo_rata']}, delta: €{delta:.2f})")

            if rata.get('scadenza_id'):
                sb.table("scadenze_pagamento").update({
                    "stato": "pagato",
                    "importo_pagato": rata['importo_rata'],
                    "data_pagamento": data_mov[:10],
                }).eq("id", rata['scadenza_id']).execute()
                print(f"    OK: Scadenza -> pagato")

            if mv.get('stato_riconciliazione') != 'riconciliato':
                sb.table("movimenti_banca").update({
                    "stato_riconciliazione": "riconciliato",
                    "scadenza_id": rata.get('scadenza_id'),
                    "categoria_dedotta": "rata_mutuo",
                }).eq("id", mv['id']).execute()
                print(f"    OK: Movimento -> riconciliato")

            fix_count += 1
        else:
            print(f"    (dry-run)")
            fix_count += 1

        rate_aperte.remove(rata)

    print(f"\n{'='*70}")
    if fix_count == 0:
        print("  Nessun match rata/movimento trovato.")
    elif EXECUTE:
        print(f"  {fix_count} rate aggiornate a 'pagato'.")
    else:
        print(f"  {fix_count} rate da aggiornare. Esegui con --execute per applicare.")
    print("=" * 70)


if __name__ == "__main__":
    main()
