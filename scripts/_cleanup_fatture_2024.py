"""
Pulizia fatture 2024 importate per errore da archivio_xml_2024.
Confronta lo stato DB con il CSV reale dell'esposizione fornitori
per validare l'operazione prima e dopo.

OPERAZIONE DISTRUTTIVA - eseguire con cautela.
Ordine di eliminazione:
  1. fatture_dettaglio_righe (FK -> fatture_fornitori)
  2. scadenze_pagamento con fattura_fornitore_id puntante a fatture 2024
  3. fatture_fornitori con data_fattura 2024
"""
import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = "--execute" not in sys.argv

# Esposizione reale da CSV fornito (fonte di verita')
CSV_ESPOSIZIONE = {
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
CSV_TOTALE = 524159.54

# Mapping nomi CSV -> nomi DB (per match non esatto)
ALIAS_NOMI = {
    "g.m.v. impianti elettrici snc": "g.m.v. impianti elettrici snc di vegetali giorgio e marco",
    "geom. imberti daniele": "imberti daniele",
    "delprino": "delprino massimo s.r.l.",
    "termoidraulica v.m": "termoidraulica v.m. snc di vavassori cristian e madaschi luca",
    "f.lli testa srl": "f.lli testa s.r.l.",
    "intesa home": "intesa home srl",
    "gmg centroedile": "gmg centroedile s.r.l.",
    "tappezziere moroni": "tappezziere moroni snc di moroni renzo e eusebio",
    "bellini e associati": "bellini e associati studio di ingegneria",
    "costruzioni edili almici": "costruzioni edili almici srl",
    "viemme porte srl": "viemme porte s.r.l.",
    "top coperture srl": "top coperture s.r.l. societ\xe0 unipersonale",
    "edilcommercio srl": "edilcommercio s.r.l.",
}

STATI_APERTI = {"da_pagare", "scaduta", "da_smistare", "scaduto"}


def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode())


def fetch_all(table, select):
    all_data, offset = [], 0
    while True:
        r = supabase.table(table).select(select).range(offset, offset + 999).execute()
        all_data.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return all_data


def calcola_esposizione_db():
    scadenze = fetch_all("scadenze_pagamento",
        "id,soggetto_id,importo_totale,importo_pagato,stato,tipo,fattura_fornitore_id")
    anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
    anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

    esposizione = {}
    for s in scadenze:
        if s.get("tipo") != "uscita":
            continue
        if s.get("stato") not in STATI_APERTI:
            continue
        sid = s.get("soggetto_id")
        nome = anag_map.get(sid, "?").lower().strip()
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        if nome not in esposizione:
            esposizione[nome] = 0
        esposizione[nome] += residuo
    return esposizione


def calcola_esposizione_rimossa(fattura_ids):
    """Quanto viene rimosso per fornitore eliminando le scadenze delle fatture 2024."""
    anag = fetch_all("anagrafica_soggetti", "id,ragione_sociale")
    anag_map = {a["id"]: a.get("ragione_sociale", "?") for a in anag}

    rimosso = {}
    for fid in fattura_ids:
        scad = supabase.table("scadenze_pagamento").select(
            "id,stato,importo_totale,importo_pagato,soggetto_id,tipo"
        ).eq("fattura_fornitore_id", fid).execute().data or []
        for s in scad:
            if s.get("tipo") != "uscita":
                continue
            if s.get("stato") not in STATI_APERTI:
                continue
            sid = s.get("soggetto_id")
            nome = anag_map.get(sid, "?").lower().strip()
            residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
            if nome not in rimosso:
                rimosso[nome] = 0
            rimosso[nome] += residuo
    return rimosso


def normalizza_nome(nome):
    n = nome.lower().strip()
    return ALIAS_NOMI.get(n, n)


def confronta_con_csv(esposizione_db, label):
    """Confronta esposizione DB con CSV, mostra solo discrepanze."""
    csv_normalizzato = {}
    for k, v in CSV_ESPOSIZIONE.items():
        nk = normalizza_nome(k)
        csv_normalizzato[nk] = csv_normalizzato.get(nk, 0) + v

    tutti = set(list(csv_normalizzato.keys()) + list(esposizione_db.keys()))
    tolleranza = 5.0

    discrepanze = []
    solo_db = []
    for nome in sorted(tutti):
        csv_val = csv_normalizzato.get(nome)
        db_val = esposizione_db.get(nome)
        if nome == "?":
            continue
        if csv_val is not None and db_val is not None:
            if abs(csv_val - db_val) > tolleranza:
                discrepanze.append((nome, csv_val, db_val, db_val - csv_val))
        elif db_val is not None and csv_val is None:
            if abs(db_val) > tolleranza:
                solo_db.append((nome, db_val))

    tot_db = sum(v for k, v in esposizione_db.items() if k != "?")
    n_disc = len(discrepanze) + len(solo_db)

    safe_print(f"\n{'='*95}")
    safe_print(f"  {label}")
    safe_print(f"  DB totale (escl. ?): EUR {tot_db:>12,.2f}  |  CSV target: EUR {CSV_TOTALE:>12,.2f}  |  Discrepanze: {n_disc}")
    safe_print(f"{'='*95}")

    if discrepanze:
        safe_print(f"\n  Importi diversi ({len(discrepanze)}):")
        safe_print(f"  {'FORNITORE':<48} | {'CSV':>10} | {'DB':>10} | {'DELTA':>10}")
        safe_print(f"  {'-'*85}")
        for nome, csv_v, db_v, delta in sorted(discrepanze, key=lambda x: -abs(x[3])):
            safe_print(f"  {nome[:46]:<48} | {csv_v:>10,.0f} | {db_v:>10,.0f} | {delta:>+10,.0f}")

    if solo_db:
        safe_print(f"\n  Solo nel DB, non nel CSV ({len(solo_db)}):")
        safe_print(f"  {'FORNITORE':<48} | {'DB':>10}")
        safe_print(f"  {'-'*62}")
        for nome, val in sorted(solo_db, key=lambda x: -abs(x[1])):
            safe_print(f"  {nome[:46]:<48} | {val:>10,.0f}")

    if n_disc == 0:
        safe_print("\n  Nessuna discrepanza significativa.")

    return n_disc


def delete_righe_dettaglio(fattura_ids):
    count = 0
    for fid in fattura_ids:
        righe = supabase.table("fatture_dettaglio_righe").select("id").eq("fattura_id", fid).execute()
        ids = [r["id"] for r in (righe.data or [])]
        count += len(ids)
        if not DRY_RUN:
            for rid in ids:
                supabase.table("fatture_dettaglio_righe").delete().eq("id", rid).execute()
    return count


def delete_scadenze(fattura_ids):
    count = 0
    for fid in fattura_ids:
        scad = supabase.table("scadenze_pagamento").select("id").eq("fattura_fornitore_id", fid).execute()
        ids = [s["id"] for s in (scad.data or [])]
        count += len(ids)
        if not DRY_RUN:
            for sid in ids:
                supabase.table("scadenze_pagamento").delete().eq("id", sid).execute()
    return count


def delete_fatture(fattura_ids):
    if not DRY_RUN:
        for fid in fattura_ids:
            supabase.table("fatture_fornitori").delete().eq("id", fid).execute()
    return len(fattura_ids)


def main():
    mode = "DRY RUN (simulazione)" if DRY_RUN else "ESECUZIONE REALE"
    safe_print(f"=== PULIZIA FATTURE 2024 - {mode} ===\n")

    # --- FASE 0: confronto PRE-pulizia ---
    safe_print("Caricamento esposizione attuale...")
    esp_prima = calcola_esposizione_db()
    confronta_con_csv(esp_prima, "PRIMA DELLA PULIZIA")

    # --- Identifica fatture da eliminare ---
    res = supabase.table("fatture_fornitori").select(
        "id, numero_fattura, data_fattura, ragione_sociale, importo_totale"
    ).gte("data_fattura", "2024-01-01").lte("data_fattura", "2024-12-31").execute()
    fatture = res.data or []

    safe_print(f"\nFatture fornitori 2024 da eliminare: {len(fatture)}")
    if not fatture:
        safe_print("Nessuna fattura 2024 nel DB.")
        return

    fattura_ids = [f["id"] for f in fatture]

    # --- Calcola impatto per fornitore ---
    safe_print("Calcolo impatto rimozione...")
    rimosso = calcola_esposizione_rimossa(fattura_ids)

    # --- Proiezione POST-pulizia ---
    esp_dopo = {}
    for nome, val in esp_prima.items():
        nuovo = val - rimosso.get(nome, 0)
        if abs(nuovo) > 0.01:
            esp_dopo[nome] = nuovo
    confronta_con_csv(esp_dopo, "DOPO LA PULIZIA (proiezione)")

    # --- Eliminazione ---
    safe_print(f"\n{'='*60}")
    safe_print(f"  ELIMINAZIONE - {mode}")
    safe_print(f"{'='*60}")

    safe_print("\n  Fase 1/3: righe dettaglio...")
    n_righe = delete_righe_dettaglio(fattura_ids)
    safe_print(f"  -> {n_righe} righe {'eliminate' if not DRY_RUN else 'da eliminare'}")

    safe_print("\n  Fase 2/3: scadenze collegate...")
    n_scadenze = delete_scadenze(fattura_ids)
    safe_print(f"  -> {n_scadenze} scadenze {'eliminate' if not DRY_RUN else 'da eliminare'}")

    safe_print("\n  Fase 3/3: fatture fornitori...")
    n_fatture = delete_fatture(fattura_ids)
    safe_print(f"  -> {n_fatture} fatture {'eliminate' if not DRY_RUN else 'da eliminare'}")

    # --- Verifica POST (solo in esecuzione reale) ---
    if not DRY_RUN:
        safe_print("\nVerifica post-pulizia...")
        esp_reale_dopo = calcola_esposizione_db()
        confronta_con_csv(esp_reale_dopo, "DOPO LA PULIZIA (verifica reale)")

    safe_print(f"\n{'='*60}")
    safe_print(f"  RIEPILOGO {'(SIMULAZIONE)' if DRY_RUN else '(COMPLETATO)'}")
    safe_print(f"{'='*60}")
    safe_print(f"  Righe dettaglio: {n_righe}")
    safe_print(f"  Scadenze:        {n_scadenze}")
    safe_print(f"  Fatture:         {n_fatture}")
    safe_print(f"  Esposizione rimossa: EUR {sum(rimosso.values()):>12,.2f}")

    if DRY_RUN:
        safe_print("\n  Per eseguire: python _cleanup_fatture_2024.py --execute")


if __name__ == "__main__":
    main()
