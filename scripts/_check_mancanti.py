import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

CERCA = ['gaeni', 'per piu', 'cofidis', 'manzoini', 'perani', 'edilscavi']

anag = sb.table('anagrafica_soggetti').select('id,ragione_sociale,partita_iva,tipo').execute()
anag_map = {a['id']: a['ragione_sociale'] for a in anag.data}

# ID utili
gaeni_id = next((a['id'] for a in anag.data if 'gaeni' in (a.get('ragione_sociale') or '').lower()), None)
perpiu_id = next((a['id'] for a in anag.data if 'per piu' in (a.get('ragione_sociale') or '').lower()), None)
perani_id = next((a['id'] for a in anag.data if 'damiano perani' in (a.get('ragione_sociale') or '').lower()), None)

print(f"IDs - Gaeni={gaeni_id}, PerPiu={perpiu_id}, Perani={perani_id}")

# Gaeni in fatture_fornitori
ff = sb.table('fatture_fornitori').select('id,soggetto_id,numero_fattura,data_fattura,importo_totale,ragione_sociale').execute()
print('\n=== GAENI in fatture_fornitori ===')
for f in ff.data:
    nome = (f.get('ragione_sociale') or anag_map.get(f.get('soggetto_id'), '') or '').lower()
    if 'gaeni' in nome or f.get('soggetto_id') == gaeni_id:
        sid = f.get('soggetto_id')
        print(f"  sogg={sid} | {f.get('ragione_sociale')} | fatt={f.get('numero_fattura')} | {f.get('data_fattura')} | EUR {f.get('importo_totale') or 0:,.2f}")

# Scadenze Per Piu
sc = sb.table('scadenze_pagamento').select('fattura_riferimento,stato,importo_totale,importo_pagato,data_emissione,soggetto_id').eq('tipo', 'uscita').execute()
print('\n=== SCADENZE PER PIU ===')
for s in sc.data:
    if s.get('soggetto_id') == perpiu_id:
        r = (s.get('importo_totale') or 0) - (s.get('importo_pagato') or 0)
        print(f"  fatt={s.get('fattura_riferimento'):25} | {s.get('stato'):10} | residuo={r:>8,.2f} | em={s.get('data_emissione')}")

# Fatture Per Piu vs scadenze - trova orfane
print('\n=== FATTURE PER PIU vs scadenze ===')
sc_keys_perpiu = set()
for s in sc.data:
    if s.get('soggetto_id') == perpiu_id:
        sc_keys_perpiu.add(s.get('fattura_riferimento'))
for f in ff.data:
    if f.get('soggetto_id') == perpiu_id:
        has_sc = f.get('numero_fattura') in sc_keys_perpiu
        print(f"  {f.get('numero_fattura'):25} | EUR {f.get('importo_totale') or 0:>8,.2f} | scadenza={'SI' if has_sc else 'NO'}")

# Scadenze Perani - dettaglio importi
print('\n=== SCADENZE EDILSCAVI PERANI (dettaglio) ===')
for s in sc.data:
    if s.get('soggetto_id') == perani_id:
        r = (s.get('importo_totale') or 0) - (s.get('importo_pagato') or 0)
        print(f"  fatt={s.get('fattura_riferimento'):25} | {s.get('stato'):10} | tot={s.get('importo_totale') or 0:>10,.2f} | pag={s.get('importo_pagato') or 0:>10,.2f} | residuo={r:>8,.2f}")
