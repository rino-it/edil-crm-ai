import os, sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# 1. Rate orfane (da_pagare, scadenza_id IS NULL)
r = sb.table('rate_mutuo').select('id,mutuo_id,numero_rata,importo_rata,data_scadenza,stato,scadenza_id').eq('stato','da_pagare').is_('scadenza_id','null').execute()
print(f"=== Rate orfane (da_pagare, senza scadenza_id): {len(r.data)} ===")
for x in r.data[:15]:
    print(f"  rata #{x['numero_rata']}  mutuo={x['mutuo_id']}  imp={x['importo_rata']}  scad={x['data_scadenza']}")

# 2. Tutte le rate
r2 = sb.table('rate_mutuo').select('id,stato,scadenza_id', count='exact').execute()
print(f"\n=== Tutte le rate: {r2.count} ===")
stati = {}
for x in r2.data:
    k = x['stato'] or 'null'
    stati[k] = stati.get(k, 0) + 1
for k,v in sorted(stati.items()):
    print(f"  {k}: {v}")

linked = sum(1 for x in r2.data if x.get('scadenza_id'))
print(f"  Con scadenza_id: {linked}")
print(f"  Senza scadenza_id: {r2.count - linked}")

# 3. Mutui
m = sb.table('mutui').select('id,banca_erogante,scopo,conto_banca_id,soggetto_id,numero_rate').execute()
print(f"\n=== Mutui: {len(m.data)} ===")
for x in m.data:
    print(f"  {x['id'][:8]}.. {x['banca_erogante']} - {x.get('scopo','')}  rate={x['numero_rate']}  conto={x.get('conto_banca_id','N/A')}  sogg={x.get('soggetto_id','N/A')}")

# 4. Scadenze con categoria rata_mutuo
s = sb.table('scadenze_pagamento').select('id,descrizione,importo_totale,data_scadenza,stato,fonte,categoria').eq('categoria','rata_mutuo').execute()
print(f"\n=== Scadenze rata_mutuo gia presenti: {len(s.data)} ===")
for x in s.data[:10]:
    print(f"  {x['id'][:8]}.. {x['descrizione'][:50]}  imp={x['importo_totale']}  scad={x['data_scadenza']}  stato={x['stato']}")

# 5. Check colonne rate_mutuo
print(f"\n=== Colonne rate_mutuo (prima riga) ===")
r3 = sb.table('rate_mutuo').select('*').limit(1).execute()
if r3.data:
    for k in sorted(r3.data[0].keys()):
        print(f"  {k}: {r3.data[0][k]}")
