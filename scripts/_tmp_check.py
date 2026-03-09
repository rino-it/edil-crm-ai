import os; from dotenv import load_dotenv; load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
anag = sb.table('anagrafica_soggetti').select('id,ragione_sociale').execute()
ids = {a['id']: a['ragione_sociale'] for a in anag.data if any(k in (a.get('ragione_sociale') or '').lower() for k in ['cofidis','manzoini','gaeni'])}
print('Soggetti trovati:')
for sid, nome in ids.items():
    print(f'  {nome} -> {sid}')

sc = sb.table('scadenze_pagamento').select('soggetto_id,stato,importo_totale,fattura_riferimento').eq('tipo','uscita').execute()
print('\nScadenze:')
trovate = 0
for s in sc.data:
    if s.get('soggetto_id') in ids:
        trovate += 1
        nome = ids[s['soggetto_id']]
        print(f"  {nome:35} | {s['stato']:10} | EUR {s.get('importo_totale') or 0:>10,.2f} | {s.get('fattura_riferimento')}")
if not trovate:
    print('  (nessuna scadenza trovata)')
