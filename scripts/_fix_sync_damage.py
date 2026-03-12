# coding: utf-8
"""
Fix danni da sync_excel_supabase.py - riporta esposizione al target CSV.

Strategia:
  1. Identifica scadenze uscita con stato aperto il cui soggetto NON ha
     corrispondenza nel CSV target (solo-DB) -> marca come pagato
  2. Per fornitori con esposizione DB > CSV, taglia l'eccesso
     marcando come pagato le scadenze piu vecchie
  3. Report finale con confronto

SAFE: non cancella nulla, marca come 'pagato' con importo_pagato = importo_totale.
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

CSV_DATA = {
    "albero group s.r.l.": 104.80,
    "andrea losa giardini s.r.l.": 1390.80,
    "b.m. srl": 4100.00,
    "baccino marco": 991.00,
    "baldi giovanni": 1330.36,
    "bcc di milano": 0.61,
    "bellini e associati": 2613.90,
    "belloli attilio": 44044.95,
    "bergamelli srl": 2024.41,
    "bordogni fabio": -126.88,
    "buttinoni ferramenta s.n.c. di buttinoni ernesto e pierangelo": 81.90,
    "casali nicola": 3981.60,
    "cofidis sa": 5418.00,
    "comitato paritetico territoriale artigiano": 78.08,
    "consit mangili sibella srl": 1098.00,
    "cortinovis gianluigi": 8588.32,
    "costruzioni edili almici": 4100.00,
    "cucchi peter": 1600.00,
    "delprino": 13109.85,
    "ecoberg srl": 573.77,
    "edil karim s.n.c. di mohamed nefin mohamed mohamadi & c.": 7200.00,
    "edilcassa": 1140.00,
    "edilcommercio s.r.l.": 46.85,
    "edilcommercio srl": 4207.13,
    "edilnova s.r.l.": 392.84,
    "edilscavi di damiano perani": 10000.00,
    "f.lli testa srl": 10055.85,
    "facchi srl": 463.60,
    "faip srl": 139.08,
    "fratelli baggi srl": 3000.00,
    "g.m.v. impianti elettrici snc": 80000.00,
    "gaeni monica": 555.01,
    "geom. imberti daniele": 13700.00,
    "gmg centroedile": 3575.00,
    "intesa home": 8500.00,
    "kuwait petroleum italia spa": 550.69,
    "l a  p i a z z o n i    s. r. l.": 8332.60,
    "lanfranchi marco": 2731.58,
    "leaders srl": 8430.00,
    "madaschi giuseppe": 10027.80,
    "manzoini christian avvocato": 6145.60,
    "met energia italia spa": 1163.22,
    "moioli valerio": 101.20,
    "myo spa": 153.54,
    "nodari bruno": 900.00,
    "olimpia s.r.l. unipersonale": 1263.08,
    "p&p lmc srl": 361.17,
    "pc genesi di bosio ferruccio": 98.80,
    "pedretti s.r.l.": 80180.00,
    "per piu soluzioni srl": 494.00,
    "rbp srl": 31193.11,
    "ruggipav sas di trapletti ruggero & c.": 6700.00,
    "salvetti srl": 40000.00,
    "system project s.r.l.": 352.10,
    "system project srl": 437.49,
    "tappezziere moroni": 3090.00,
    "termoidraulica v.m": 13000.00,
    "tim  s.p.a.": 77.13,
    "tim s.p.a.": 27.94,
    "top coperture srl": 70000.00,
    "uniacque s.p.a.": 0.00,
    "verisure italy srl": 167.98,
    "viemme porte srl": 101.68,
}

# Alias per match nomi DB -> CSV
ALIAS_NOMI = {
    "la piazzoni s.r.l.": "l a  p i a z z o n i    s. r. l.",
    "la piazzoni srl": "l a  p i a z z o n i    s. r. l.",
    "piazzoni": "l a  p i a z z o n i    s. r. l.",
    "delprino massimo s.r.l.": "delprino",
    "delprino massimo srl": "delprino",
    "g.m.v. impianti elettrici snc di vegetali giorgi": "g.m.v. impianti elettrici snc",
    "g.m.v. impianti elettrici s.n.c.": "g.m.v. impianti elettrici snc",
    "g.m.v. impianti": "g.m.v. impianti elettrici snc",
    "geom. imberti": "geom. imberti daniele",
    "imberti daniele": "geom. imberti daniele",
    "tappezziere moroni davide": "tappezziere moroni",
    "moroni davide": "tappezziere moroni",
    "termoidraulica v.m.": "termoidraulica v.m",
    "termoidraulica vm": "termoidraulica v.m",
    "ruggipav sas": "ruggipav sas di trapletti ruggero & c.",
    "ruggipav": "ruggipav sas di trapletti ruggero & c.",
    "buttinoni ferramenta": "buttinoni ferramenta s.n.c. di buttinoni ernesto e pierangelo",
    "edil karim": "edil karim s.n.c. di mohamed nefin mohamed mohamadi & c.",
    "edil karim s.n.c.": "edil karim s.n.c. di mohamed nefin mohamed mohamadi & c.",
    "costruzioni edili almici srl": "costruzioni edili almici",
    "kuwait petroleum": "kuwait petroleum italia spa",
    "met energia": "met energia italia spa",
    "manzoini christian": "manzoini christian avvocato",
    "bellini e associati srl": "bellini e associati",
    "olimpia s.r.l.": "olimpia s.r.l. unipersonale",
    "per piu soluzioni": "per piu soluzioni srl",
    "pc genesi": "pc genesi di bosio ferruccio",
    "system project": "system project srl",
    "p&p lmc": "p&p lmc srl",
    "comitato paritetico": "comitato paritetico territoriale artigiano",
    "consit mangili": "consit mangili sibella srl",
}

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare", "scaduto", "parziale"}


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


def match_csv_nome(nome_db_lower):
    """Cerca corrispondenza nel CSV per un nome fornitore DB."""
    if nome_db_lower in CSV_DATA:
        return nome_db_lower
    if nome_db_lower in ALIAS_NOMI:
        return ALIAS_NOMI[nome_db_lower]
    # Substring match
    for csv_nome in CSV_DATA:
        if csv_nome in nome_db_lower or nome_db_lower in csv_nome:
            return csv_nome
    return None


def main():
    mode = "DRY RUN" if DRY_RUN else "ESECUZIONE"
    safe_print(f"=== FIX DANNI SYNC - {mode} ===\n")

    # Carica dati
    scadenze = fetch_all("scadenze_pagamento",
        "id,soggetto_id,importo_totale,importo_pagato,stato,tipo,fonte,fattura_riferimento,data_scadenza,data_emissione")
    anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
    anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

    # Raggruppa scadenze aperte per fornitore
    per_fornitore = {}
    for s in scadenze:
        if s.get("tipo") != "uscita":
            continue
        if s.get("stato") not in STATI_APERTI:
            continue
        sid = s.get("soggetto_id")
        nome = anag_map.get(sid, "?").lower().strip()
        if nome not in per_fornitore:
            per_fornitore[nome] = []
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        per_fornitore[nome].append({**s, "_residuo": residuo, "_nome": nome})

    # Analizza: per ogni fornitore DB, trova il target CSV
    da_chiudere = []  # scadenze da marcare come pagato
    tot_eccesso = 0

    for nome_db, lista in sorted(per_fornitore.items()):
        esposizione_db = sum(s["_residuo"] for s in lista)
        csv_nome = match_csv_nome(nome_db)

        if csv_nome is None:
            # Fornitore non nel CSV -> tutta l'esposizione e' in eccesso
            safe_print(f"  SOLO-DB: {nome_db[:50]:<50} EUR {esposizione_db:>12,.2f} -> chiudo tutto")
            # Ordina per data scadenza (vecchie prima)
            for s in sorted(lista, key=lambda x: x.get("data_scadenza") or ""):
                da_chiudere.append(s)
            tot_eccesso += esposizione_db
            continue

        target = CSV_DATA[csv_nome]
        if target <= 0:
            # Target zero o negativo -> chiudi tutto
            if esposizione_db > 1:
                safe_print(f"  ZERO-TARGET: {nome_db[:50]:<50} EUR {esposizione_db:>12,.2f} -> chiudo tutto")
                for s in lista:
                    da_chiudere.append(s)
                tot_eccesso += esposizione_db
            continue

        eccesso = esposizione_db - target
        if eccesso <= 1.0:
            continue  # OK, allineato

        safe_print(f"  ECCESSO: {nome_db[:50]:<50} DB {esposizione_db:>10,.2f} vs CSV {target:>10,.2f} (delta +{eccesso:,.2f})")

        # Strategia: chiudi le scadenze con fonte='excel' per prime (sono quelle create dal sync),
        # poi quelle piu vecchie, fino a ridurre l'eccesso
        ordinati = sorted(lista, key=lambda x: (
            0 if x.get("fonte") == "excel" else 1,
            x.get("data_scadenza") or "",
        ))

        rimosso = 0
        for s in ordinati:
            if rimosso >= eccesso - 0.5:
                break
            da_chiudere.append(s)
            rimosso += s["_residuo"]
            tot_eccesso += s["_residuo"]

    safe_print(f"\n{'='*60}")
    safe_print(f"  Scadenze da chiudere: {len(da_chiudere)}")
    safe_print(f"  Esposizione rimossa : EUR {tot_eccesso:,.2f}")
    safe_print(f"{'='*60}")

    if not da_chiudere:
        safe_print("  Nessuna azione necessaria.")
        return

    # Dettaglio per fonte
    per_fonte = {}
    for s in da_chiudere:
        fonte = s.get("fonte") or "null"
        per_fonte[fonte] = per_fonte.get(fonte, 0) + 1
    for fonte, n in sorted(per_fonte.items()):
        safe_print(f"    fonte={fonte}: {n}")

    if DRY_RUN:
        safe_print(f"\n  Per eseguire: python _fix_sync_damage.py --execute")
        return

    # Esegui: marca come pagato
    for i, s in enumerate(da_chiudere):
        sb.table("scadenze_pagamento").update({
            "stato": "pagato",
            "importo_pagato": s.get("importo_totale") or 0,
        }).eq("id", s["id"]).execute()
        if (i + 1) % 50 == 0:
            safe_print(f"  ... {i+1}/{len(da_chiudere)}")

    safe_print(f"\n  Completato: {len(da_chiudere)} scadenze marcate come pagato.")
    safe_print(f"  Esposizione ridotta di EUR {tot_eccesso:,.2f}")


if __name__ == "__main__":
    main()
