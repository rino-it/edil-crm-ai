"""
Confronto esposizione: CSV reale vs database attuale.
Mostra solo i fornitori con discrepanze.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

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

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare", "scaduto"}

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

scadenze = fetch_all("scadenze_pagamento",
    "id,soggetto_id,importo_totale,importo_pagato,stato,tipo")
anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

db_esposizione = {}
for s in scadenze:
    if s.get("tipo") != "uscita":
        continue
    if s.get("stato") not in STATI_APERTI:
        continue
    sid = s.get("soggetto_id")
    nome = anag_map.get(sid, "?")
    residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
    nome_lower = nome.lower().strip()
    if nome_lower not in db_esposizione:
        db_esposizione[nome_lower] = {"importo": 0, "nome_orig": nome}
    db_esposizione[nome_lower]["importo"] += residuo

tutti = set(list(CSV_DATA.keys()) + list(db_esposizione.keys()))

TOLLERANZA = 1.0

discrepanze = []
solo_csv = []
solo_db = []

for nome in sorted(tutti):
    csv_val = CSV_DATA.get(nome)
    db_entry = db_esposizione.get(nome)
    db_val = db_entry["importo"] if db_entry else None
    db_nome = db_entry["nome_orig"] if db_entry else nome

    if csv_val is not None and db_val is not None:
        if abs(csv_val - db_val) > TOLLERANZA:
            discrepanze.append((db_nome, csv_val, db_val, db_val - csv_val))
    elif csv_val is not None and db_val is None:
        if abs(csv_val) > TOLLERANZA:
            solo_csv.append((nome, csv_val))
    elif db_val is not None and csv_val is None:
        if abs(db_val) > TOLLERANZA:
            solo_db.append((db_nome, db_val))

safe_print(f"{'='*105}")
safe_print(f"DISCREPANZE TRA CSV (reale) E DATABASE")
safe_print(f"{'='*105}")

if discrepanze:
    safe_print(f"\n--- IMPORTI DIVERSI ({len(discrepanze)}) ---")
    safe_print(f"{'FORNITORE':<50} | {'CSV':>12} | {'DB':>12} | {'DELTA':>12}")
    safe_print(f"{'-'*95}")
    tot_delta = 0
    for nome, csv_v, db_v, delta in sorted(discrepanze, key=lambda x: -abs(x[3])):
        safe_print(f"  {nome[:48]:<48} | {csv_v:>12,.2f} | {db_v:>12,.2f} | {delta:>+12,.2f}")
        tot_delta += delta
    safe_print(f"{'-'*95}")
    safe_print(f"  {'TOTALE DELTA':<48} | {'':>12} | {'':>12} | {tot_delta:>+12,.2f}")

if solo_csv:
    safe_print(f"\n--- SOLO NEL CSV, NON NEL DB ({len(solo_csv)}) ---")
    safe_print(f"{'FORNITORE':<50} | {'CSV':>12}")
    safe_print(f"{'-'*65}")
    for nome, val in sorted(solo_csv, key=lambda x: -abs(x[1])):
        safe_print(f"  {nome[:48]:<48} | {val:>12,.2f}")

if solo_db:
    safe_print(f"\n--- SOLO NEL DB, NON NEL CSV ({len(solo_db)}) ---")
    safe_print(f"{'FORNITORE':<50} | {'DB':>12}")
    safe_print(f"{'-'*65}")
    for nome, val in sorted(solo_db, key=lambda x: -abs(x[1])):
        safe_print(f"  {nome[:48]:<48} | {val:>12,.2f}")

if not discrepanze and not solo_csv and not solo_db:
    safe_print("\nNessuna discrepanza trovata.")

safe_print(f"\n{'='*105}")
safe_print(f"CSV totale: EUR {sum(CSV_DATA.values()):>12,.2f}")
safe_print(f"DB  totale: EUR {sum(d['importo'] for d in db_esposizione.values()):>12,.2f}")
safe_print(f"{'='*105}")
