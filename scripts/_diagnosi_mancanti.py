import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

cercati = ['cofidis', 'manzoini', 'gaeni', 'per piu soluzioni', 'edilscavi di damiano', 'perani']

# 1. Check anagrafica
anag = sb.table('anagrafica_soggetti').select('id,ragione_sociale,tipo,partita_iva').execute()
print('=== ANAGRAFICA ===')
trovati_anag = {}
for a in anag.data:
    nome = (a.get('ragione_sociale') or '').lower()
    for c in cercati:
        if c in nome:
            print(f'  TROVATO: {a["ragione_sociale"]} | id={a["id"]} | tipo={a["tipo"]} | piva={a.get("partita_iva")}')
            trovati_anag[c] = a['id']

mancanti_anag = [c for c in cercati if c not in trovati_anag]
if mancanti_anag:
    print(f'  NON IN ANAGRAFICA: {mancanti_anag}')

# 2. Check scadenze_pagamento (tutti gli stati)
sc = sb.table('scadenze_pagamento').select('id,descrizione,stato,importo_totale,importo_pagato,fonte,data_scadenza').execute()
print()
print('=== SCADENZE (tutti gli stati) ===')
for s in sc.data:
    desc = (s.get('descrizione') or '').lower()
    for c in cercati:
        if c in desc:
            residuo = (s['importo_totale'] or 0) - (s['importo_pagato'] or 0)
            print(f'  stato={s["stato"]:<12} fonte={s["fonte"]:<12} EUR {s["importo_totale"]:>10,.2f} (res={residuo:,.2f}) scad={s["data_scadenza"]} | {s["descrizione"][:60]}')

# 3. Check CSV
print()
print('=== CSV ESPOSIZIONE ===')
import csv
csv_path = os.path.join(os.path.dirname(__file__), '_esposizione.csv')
with open(csv_path, encoding='latin-1') as f:
    reader = csv.reader(f, delimiter=';')
    for row in reader:
        if len(row) < 2:
            continue
        fornitore = row[0].lower()
        for c in cercati:
            if c in fornitore:
                print(f'  {row}')
