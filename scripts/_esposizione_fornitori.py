"""
Report esposizione fornitori: importi aperti (non pagati) per fornitore.
Mostra:
  - Esposizione ATTUALE (solo scadenze esistenti)
  - Esposizione DOPO aggiunta delle 215 orfane
  - Delta per fornitore
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

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

def log(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

# --- Dati ---
log("Caricamento dati...")
scadenze = fetch_all('scadenze_pagamento',
    'id,soggetto_id,fattura_riferimento,importo_totale,importo_pagato,stato,data_emissione,data_scadenza,tipo')
fatture = fetch_all('fatture_fornitori',
    'id,soggetto_id,numero_fattura,data_fattura,importo_totale,ragione_sociale')
anag = fetch_all('anagrafica_soggetti', 'id,ragione_sociale,tipo')

anag_map = {a['id']: a.get('ragione_sociale','?') for a in anag}

# --- Scadenze uscita aperte (attuale) ---
# "aperta" = stato in (da_pagare, scaduta, da_smistare) e tipo=uscita
STATI_APERTI = {'da_pagare', 'scaduta', 'da_smistare'}

esposizione_attuale = {}
for s in scadenze:
    if s.get('tipo') != 'uscita': continue
    if s.get('stato') not in STATI_APERTI: continue
    sid = s.get('soggetto_id')
    nome = anag_map.get(sid, '?')
    importo = (s.get('importo_totale') or 0) - (s.get('importo_pagato') or 0)
    if nome not in esposizione_attuale:
        esposizione_attuale[nome] = {'importo': 0, 'n_scadenze': 0}
    esposizione_attuale[nome]['importo'] += importo
    esposizione_attuale[nome]['n_scadenze'] += 1

# --- Orfane (fatture senza scadenza) ---
sc_keys = set()
for s in scadenze:
    sc_keys.add((s.get('soggetto_id'), s.get('fattura_riferimento'), s.get('data_emissione')))

orphans = []
for f in fatture:
    key = (f.get('soggetto_id'), f.get('numero_fattura'), f.get('data_fattura'))
    if key not in sc_keys:
        orphans.append(f)

delta_per_fornitore = {}
for f in orphans:
    nome = f.get('ragione_sociale') or anag_map.get(f.get('soggetto_id'), '?')
    importo = f.get('importo_totale') or 0
    if nome not in delta_per_fornitore:
        delta_per_fornitore[nome] = {'importo': 0, 'n_fatture': 0}
    delta_per_fornitore[nome]['importo'] += importo
    delta_per_fornitore[nome]['n_fatture'] += 1

# --- Merge: esposizione DOPO ---
tutti_fornitori = set(list(esposizione_attuale.keys()) + list(delta_per_fornitore.keys()))

log(f"\n{'='*100}")
log(f"ESPOSIZIONE FORNITORI - USCITE APERTE (non pagate)")
log(f"{'='*100}")
log(f"{'FORNITORE':<45} | {'ATTUALE':>12} | {'+ ORFANE':>12} | {'= DOPO':>12} | {'N.ATT':>5} | {'N.ORF':>5}")
log(f"{'-'*100}")

rows = []
for nome in tutti_fornitori:
    att = esposizione_attuale.get(nome, {'importo': 0, 'n_scadenze': 0})
    delta = delta_per_fornitore.get(nome, {'importo': 0, 'n_fatture': 0})
    dopo = att['importo'] + delta['importo']
    rows.append((nome, att['importo'], delta['importo'], dopo, att['n_scadenze'], delta['n_fatture']))

# Ordina per esposizione DOPO (decrescente)
rows.sort(key=lambda x: -x[3])

totale_att = 0
totale_delta = 0
totale_dopo = 0

for nome, att_imp, delta_imp, dopo_imp, n_att, n_orf in rows:
    if dopo_imp == 0 and att_imp == 0: continue  # skip zero
    totale_att += att_imp
    totale_delta += delta_imp
    totale_dopo += dopo_imp
    delta_str = f"+{delta_imp:>10,.2f}" if delta_imp > 0 else f"{delta_imp:>11,.2f}" if delta_imp < 0 else "           -"
    log(f"  {nome[:43]:<43} | {att_imp:>12,.2f} | {delta_str} | {dopo_imp:>12,.2f} | {n_att:>5} | {n_orf:>5}")

log(f"{'-'*100}")
log(f"  {'TOTALE':<43} | {totale_att:>12,.2f} | +{totale_delta:>10,.2f} | {totale_dopo:>12,.2f}")
log(f"{'='*100}")

log(f"\nFornitori con esposizione attuale: {len([r for r in rows if r[1] > 0])}")
log(f"Fornitori con orfane da aggiungere: {len([r for r in rows if r[2] > 0])}")
log(f"Fornitori totali con esposizione: {len([r for r in rows if r[3] > 0])}")
