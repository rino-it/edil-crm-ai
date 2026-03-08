"""Find fatture_fornitori without a matching scadenza"""
import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

def fetch_all(table, select):
    all_data = []
    offset = 0
    while True:
        r = sb.table(table).select(select).range(offset, offset + 999).execute()
        all_data.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return all_data

ff_all = fetch_all('fatture_fornitori', 'id,soggetto_id,numero_fattura,data_fattura,importo_totale,ragione_sociale')
sc_all = fetch_all('scadenze_pagamento', 'soggetto_id,fattura_riferimento,data_emissione')

sc_keys = set()
for s in sc_all.data if hasattr(sc_all, 'data') else sc_all:
    sc_keys.add((s.get('soggetto_id'), s.get('fattura_riferimento'), s.get('data_emissione')))

orphans = []
for f in ff_all:
    key = (f.get('soggetto_id'), f.get('numero_fattura'), f.get('data_fattura'))
    if key not in sc_keys:
        orphans.append(f)

print(f"Fatture fornitori totali: {len(ff_all)}")
print(f"Scadenze totali: {len(sc_all)}")
print(f"Fatture SENZA scadenza: {len(orphans)}")
print()
for f in orphans:
    nome = (f.get('ragione_sociale') or '?')[:42]
    fatt = f.get('numero_fattura', '?')
    data = f.get('data_fattura', '?')
    imp = f.get('importo_totale', 0)
    print(f"  {nome:<42} | {fatt:<20} | {data} | EUR {imp}")
