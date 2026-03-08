"""
Confronto esposizione: Excel utente vs CRM (attuale + orfane).
Evidenzia discrepanze per decidere quali orfane creare come da_pagare vs già pagate.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

def fetch_all(table, select):
    all_data, offset = [], 0
    while True:
        r = sb.table(table).select(select).range(offset, offset + 999).execute()
        all_data.extend(r.data)
        if len(r.data) < 1000: break
        offset += 1000
    return all_data

def log(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

# --- Dati Excel utente (dal screenshot) ---
EXCEL = {
    "Andrea Losa Giardini s.r.l.": 1390.80,
    "Baccino Marco": 991.00,
    "BCC di Milano": 0.61,
    "Bellini e associati": 2613.90,
    "Belloli Attilio": 44044.95,
    "Bergamelli srl": 2024.41,
    "Bordogni Fabio": -126.88,
    "Casali Nicola": 3981.60,
    "Consit Mangili Sibella SRL": 1098.00,
    "Cortinovis Gianluigi": 8588.32,
    "Costruzioni Edili Almici": 4100.00,
    "Cucchi Peter": 1600.00,
    "DELPRINO": 13109.85,
    "Ecoberg srl": 573.77,
    "Edilcassa": 1140.00,
    "Edilcommercio srl": 4207.13,
    "Edilnova s.r.l.": 392.84,
    "Edilscavi di Damiano Perani": 10000.00,
    "F.lli Testa srl": 10055.85,
    "FAIP SRL": 139.08,
    "FRATELLI BAGGI SRL": 3000.00,
    "G.M.V. IMPIANTI ELETTRICI SNC": 80000.00,
    "Geom. Imberti Daniele": 13700.00,
    "GMG CENTROEDILE": 3575.00,
    "Intesa Home": 8500.00,
    "Kuwait Petroleum Italia spa": 1112.50,
    "La Piazzoni s.r.l.": 7905.60,
    "Lanfranchi Marco": 2731.58,
    "Leaders srl": 8430.00,
    "Madaschi Giuseppe": 10027.80,
    "Met Energia Italia Spa": 1163.22,
    "Moioli Valerio": 101.20,
    "Myo spa": 153.54,
    "Nodari Bruno": 900.00,
    "Olimpia s.r.l. Unipersonale": 1263.08,
    "P&P LMC srl": 361.17,
    "PC Genesi di Bosio Ferruccio": 98.80,
    "Pedretti s.r.l.": 80180.00,
    "RBP SRL": 31193.11,
    "Salvetti srl": 40000.00,
    "System project srl": 437.49,
    "Tappezziere Moroni": 3090.00,
    "Termoidraulica V.M": 13000.00,
    "Tim s.p.a. (27.94)": 27.94,
    "Top Coperture srl": 70000.00,
    "Verisure Italy srl": 167.98,
    "Viemme Porte srl": 101.68,
    "Facchi srl": 463.60,
    "Edil Karim s.n.c.": 7200.00,
    "Cofidis sa": 5418.00,
    "Manzoini Christian avvocato": 6145.60,
    "Albero Group s.r.l.": 104.80,
    "La Piazzoni s.r.l. (2)": 427.00,
    "Ruggipav sas": 6700.00,
    "System project s.r.l. (2)": 352.10,
    "Tim s.p.a. (77.13)": 77.13,
    "B.M. srl": 4100.00,
    "Baldi Giovanni": 1330.36,
    "Comitato paritetico territoriale": 78.08,
}
EXCEL_TOTAL = 523543.59

# --- Dati CRM ---
log("Caricamento dati CRM...")
scadenze = fetch_all('scadenze_pagamento',
    'id,soggetto_id,fattura_riferimento,importo_totale,importo_pagato,stato,data_emissione,tipo')
fatture = fetch_all('fatture_fornitori',
    'id,soggetto_id,numero_fattura,data_fattura,importo_totale,ragione_sociale')
anag = fetch_all('anagrafica_soggetti', 'id,ragione_sociale,tipo')

anag_map = {a['id']: a.get('ragione_sociale','?') for a in anag}

STATI_APERTI = {'da_pagare', 'scaduta', 'da_smistare'}

# Esposizione attuale per soggetto_id
esp_per_soggetto = {}
for s in scadenze:
    if s.get('tipo') != 'uscita': continue
    if s.get('stato') not in STATI_APERTI: continue
    sid = s.get('soggetto_id')
    importo = (s.get('importo_totale') or 0) - (s.get('importo_pagato') or 0)
    if sid not in esp_per_soggetto:
        esp_per_soggetto[sid] = 0
    esp_per_soggetto[sid] += importo

# Orfane per soggetto_id
sc_keys = set()
for s in scadenze:
    sc_keys.add((s.get('soggetto_id'), s.get('fattura_riferimento'), s.get('data_emissione')))

orf_per_soggetto = {}
for f in fatture:
    key = (f.get('soggetto_id'), f.get('numero_fattura'), f.get('data_fattura'))
    if key not in sc_keys:
        sid = f.get('soggetto_id')
        if sid not in orf_per_soggetto:
            orf_per_soggetto[sid] = 0
        orf_per_soggetto[sid] += (f.get('importo_totale') or 0)

# Esposizione per nome (raggruppa duplicati nome)
esp_per_nome = {}
for sid, imp in esp_per_soggetto.items():
    nome = anag_map.get(sid, '?')
    if nome not in esp_per_nome:
        esp_per_nome[nome] = {'attuale': 0, 'orfane': 0}
    esp_per_nome[nome]['attuale'] += imp
for sid, imp in orf_per_soggetto.items():
    nome = anag_map.get(sid, '?')
    if nome not in esp_per_nome:
        esp_per_nome[nome] = {'attuale': 0, 'orfane': 0}
    esp_per_nome[nome]['orfane'] += imp

# --- Tutti i soggetti con scadenze aperte + le loro fatture totali ---
# Per ogni soggetto, mostriamo: scadenze attuali aperte, orfane, e totale
log(f"\n{'='*120}")
log(f"ESPOSIZIONE CRM COMPLETA PER NOME (scadenze aperte + orfane se create come da_pagare)")
log(f"{'='*120}")
log(f"{'FORNITORE CRM':<48} | {'ATTUALE':>12} | {'+ ORFANE':>12} | {'= CRM DOPO':>12}")
log(f"{'-'*120}")

crm_rows = []
for nome, vals in esp_per_nome.items():
    dopo = vals['attuale'] + vals['orfane']
    if dopo > 0:
        crm_rows.append((nome, vals['attuale'], vals['orfane'], dopo))

crm_rows.sort(key=lambda x: -x[3])
crm_total = sum(r[3] for r in crm_rows)

for nome, att, orf, dopo in crm_rows:
    orf_str = f"+{orf:>10,.2f}" if orf > 0 else "           -"
    log(f"  {nome[:46]:<46} | {att:>12,.2f} | {orf_str} | {dopo:>12,.2f}")

log(f"{'-'*120}")
log(f"  {'CRM TOTALE':<46} | {'':>12} | {'':>12} | {crm_total:>12,.2f}")

# --- Confronto diretto ---
log(f"\n\n{'='*120}")
log(f"CONFRONTO: EXCEL vs CRM (dopo orfane)")
log(f"{'='*120}")
log(f"{'FORNITORE EXCEL':<42} | {'EXCEL':>12} | {'CRM DOPO':>12} | {'DELTA':>12} | NOTE")
log(f"{'-'*120}")

# Mappatura nomi Excel → nomi CRM (fuzzy)
NAME_MAP = {
    "Andrea Losa Giardini s.r.l.": None,  # non in CRM
    "Baccino Marco": "Baccino Marco",
    "BCC di Milano": "BCC DI MILANO",
    "Bellini e associati": "BELLINI E ASSOCIATI STUDIO DI INGEGNERIA",
    "Belloli Attilio": "Belloli Attilio",
    "Bergamelli srl": None,
    "Bordogni Fabio": "BORDOGNI FABIO",
    "Casali Nicola": None,
    "Consit Mangili Sibella SRL": "Consit Mangili Sibella Srl",
    "Cortinovis Gianluigi": "STUDIO TECNICO ARCHITETTO GIANLUIGI CORTINO",
    "Costruzioni Edili Almici": None,
    "Cucchi Peter": "CUCCHI PETER",
    "DELPRINO": "DELPRINO MASSIMO S.R.L.",
    "Ecoberg srl": "ECOBERG SRL",
    "Edilcassa": "EDILCASSA",
    "Edilcommercio srl": "Edilcommercio s.r.l.",
    "Edilnova s.r.l.": None,
    "Edilscavi di Damiano Perani": ["EDILSCAVI DI DAMIANO PERANI", "EDILSCAVI S.R.L."],
    "F.lli Testa srl": ["F.LLI TESTA S.R.L.", "FRATELLI TESTA S.R.L."],
    "FAIP SRL": "F.A.I.P. SRL",
    "FRATELLI BAGGI SRL": "FRATELLI BAGGI SRL",
    "G.M.V. IMPIANTI ELETTRICI SNC": "G.M.V. IMPIANTI ELETTRICI SNC DI VEGETALI G",
    "Geom. Imberti Daniele": "IMBERTI DANIELE",
    "GMG CENTROEDILE": None,
    "Intesa Home": "INTESA HOME SRL",
    "Kuwait Petroleum Italia spa": "KUWAIT PETROLEUM ITALIA SPA",
    "La Piazzoni s.r.l.": "L A  P I A Z Z O N I    S. R. L.",
    "Lanfranchi Marco": None,
    "Leaders srl": "LEADERS SRL",
    "Madaschi Giuseppe": None,
    "Met Energia Italia Spa": None,
    "Moioli Valerio": None,
    "Myo spa": "MYO SPA",
    "Nodari Bruno": None,
    "Olimpia s.r.l. Unipersonale": "OLIMPIA S.R.L. UNIPERSONALE",
    "P&P LMC srl": "P&P LMC SRL",
    "PC Genesi di Bosio Ferruccio": "Pc Genesi di Bosio Ferruccio",
    "Pedretti s.r.l.": None,
    "RBP SRL": None,
    "Salvetti srl": None,
    "System project srl": "SYSTEM PROJECT S.R.L.",
    "Tappezziere Moroni": None,
    "Termoidraulica V.M": "TERMOIDRAULICA V.M. SNC DI VAVASSORI CRISTI",
    "Tim s.p.a. (27.94)": "TIM  S.p.A.",
    "Top Coperture srl": "TOP COPERTURE S.R.L. società unipersonale",
    "Verisure Italy srl": "Verisure Italy Srl",
    "Viemme Porte srl": None,
    "Facchi srl": None,
    "Edil Karim s.n.c.": None,
    "Cofidis sa": None,
    "Manzoini Christian avvocato": None,
    "Albero Group s.r.l.": None,
    "La Piazzoni s.r.l. (2)": "L A  P I A Z Z O N I    S. R. L.",  # duplicate
    "Ruggipav sas": None,
    "System project s.r.l. (2)": "SYSTEM PROJECT S.R.L.",
    "Tim s.p.a. (77.13)": "TIM  S.p.A.",
    "B.M. srl": None,
    "Baldi Giovanni": "BALDI GIOVANNI",
    "Comitato paritetico territoriale": None,
}

total_excel = 0
total_crm = 0
total_match = 0
total_only_excel = 0
total_only_crm = 0
matched_crm_names = set()

for excel_name, excel_val in sorted(EXCEL.items(), key=lambda x: -x[1]):
    total_excel += excel_val
    crm_names = NAME_MAP.get(excel_name)
    
    if crm_names is None:
        log(f"  {excel_name[:40]:<40} | {excel_val:>12,.2f} | {'---':>12} | {excel_val:>12,.2f} | ⚠️  SOLO EXCEL (no XML)")
        total_only_excel += excel_val
        continue
    
    if isinstance(crm_names, str):
        crm_names = [crm_names]
    
    crm_val = 0
    for cn in crm_names:
        if cn in esp_per_nome:
            v = esp_per_nome[cn]
            crm_val += v['attuale'] + v['orfane']
            matched_crm_names.add(cn)
    
    delta = crm_val - excel_val
    total_crm += crm_val
    
    if abs(delta) < 1:
        note = "✅ OK"
        total_match += 1
    elif delta > 0:
        note = f"🔴 CRM +{delta:,.2f} (troppe orfane?)"
    else:
        note = f"🟡 CRM {delta:,.2f} (manca qualcosa)"
    
    log(f"  {excel_name[:40]:<40} | {excel_val:>12,.2f} | {crm_val:>12,.2f} | {delta:>+12,.2f} | {note}")

log(f"{'-'*120}")
log(f"  {'TOTALI CONFRONTATI':<40} | {total_excel:>12,.2f} | {total_crm:>12,.2f} | {total_crm - total_excel:>+12,.2f}")

# Fornitori CRM che non sono nell'Excel
log(f"\n\n{'='*120}")
log(f"FORNITORI NEL CRM (con esposizione) MA NON NELL'EXCEL")
log(f"{'='*120}")
solo_crm_total = 0
for nome, att, orf, dopo in crm_rows:
    if nome not in matched_crm_names:
        log(f"  {nome[:46]:<46} | CRM: {dopo:>12,.2f} | att={att:,.2f} orf={orf:,.2f}")
        solo_crm_total += dopo

log(f"\n  Totale solo CRM: EUR {solo_crm_total:,.2f}")

# Riepilogo
log(f"\n\n{'='*120}")
log("RIEPILOGO")
log(f"{'='*120}")
log(f"  Excel totale:                  EUR {EXCEL_TOTAL:>12,.2f}")
log(f"  CRM dopo orfane (tutti):       EUR {crm_total:>12,.2f}")
log(f"  Delta:                         EUR {crm_total - EXCEL_TOTAL:>+12,.2f}")
log(f"")
log(f"  Di cui solo in Excel:          EUR {total_only_excel:>12,.2f}")
log(f"  Di cui solo in CRM:            EUR {solo_crm_total:>12,.2f}")
log(f"")
log(f"  Fornitori Excel matchati con CRM: {total_match} su {len(EXCEL)}")
