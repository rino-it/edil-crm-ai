"""Tabella esposizione debiti aperti per fornitore (no banche)."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

def fetch_all(table, select):
    all_data, offset = [], 0
    while True:
        r = sb.table(table).select(select).range(offset, offset + 999).execute()
        all_data.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return all_data

anag = fetch_all('anagrafica_soggetti', 'id,ragione_sociale,tipo')
BANCHE_IDS = {
    a['id'] for a in anag
    if (a.get('tipo') or '').lower() in ('banca', 'banche', 'bank', 'istituto di credito', 'istituto credito')
}
anag_map = {a['id']: a.get('ragione_sociale', '?') for a in anag}

scadenze = fetch_all('scadenze_pagamento', 'id,soggetto_id,importo_totale,importo_pagato,stato,tipo,data_scadenza,fattura_riferimento,note')
STATI_APERTI = {'da_pagare', 'scaduta', 'da_smistare', 'parziale'}

# Raggruppa le scadenze per fornitore (dettaglio)
dettaglio = {}
for s in scadenze:
    if s.get('tipo') != 'uscita':
        continue
    if s.get('stato') not in STATI_APERTI:
        continue
    sid = s.get('soggetto_id')
    if sid in BANCHE_IDS:
        continue
    nome = anag_map.get(sid, '?') if sid else '?'
    residuo = (s.get('importo_totale') or 0) - (s.get('importo_pagato') or 0)
    if residuo <= 0:
        continue
    if nome not in dettaglio:
        dettaglio[nome] = []
    dettaglio[nome].append({
        'data_scad': str(s.get('data_scadenza') or '')[:10],
        'rif': str(s.get('fattura_riferimento') or s.get('note') or '')[:28],
        'stato': str(s.get('stato') or ''),
        'importo': residuo,
    })

# Ordina fornitori per totale decrescente
fornitori_ord = sorted(dettaglio.keys(), key=lambda n: -sum(r['importo'] for r in dettaglio[n]))

SEP = '=' * 80
sep = '-' * 80
totale_globale = 0.0
print()
for nome in fornitori_ord:
    righe = sorted(dettaglio[nome], key=lambda x: x['data_scad'])
    tot_forn = sum(r['importo'] for r in righe)
    totale_globale += tot_forn
    print(SEP)
    print("  FORNITORE: {}  (totale: {:,.2f} €)".format(nome, tot_forn))
    print("  {:<10}  {:<28}  {:<14}  {:>12}".format('SCADENZA', 'RIFERIMENTO', 'STATO', 'RESIDUO €'))
    print(sep)
    for r in righe:
        print("  {:<10}  {:<28}  {:<14}  {:>12,.2f}".format(
            r['data_scad'], r['rif'][:28], r['stato'][:14], r['importo']))
print(SEP)
print("  TOTALE GENERALE: {:,.2f} €  ({} scadenze aperte)".format(
    totale_globale, sum(len(v) for v in dettaglio.values())))
print(SEP)
print()
