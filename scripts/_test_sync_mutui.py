import os, json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Test 1: Does the join query work?
print("=== Test join query (same as sincronizzaScadenzeMutui) ===")
try:
    r = sb.table('rate_mutuo').select(
        'id, mutuo_id, numero_rata, importo_rata, data_scadenza, stato, mutui!inner(id, conto_banca_id, banca_erogante, scopo, soggetto_id, numero_rate)'
    ).eq('stato', 'da_pagare').is_('scadenza_id', 'null').limit(3).execute()
    print(f"Success! Got {len(r.data)} rows")
    if r.data:
        print(json.dumps(r.data[0], indent=2, default=str))
except Exception as e:
    print(f"ERROR: {e}")

# Test 2: Try without !inner
print("\n=== Test join without !inner ===")
try:
    r2 = sb.table('rate_mutuo').select(
        'id, mutuo_id, numero_rata, importo_rata, data_scadenza, stato, mutui(id, conto_banca_id, banca_erogante, scopo, soggetto_id, numero_rate)'
    ).eq('stato', 'da_pagare').is_('scadenza_id', 'null').limit(3).execute()
    print(f"Success! Got {len(r2.data)} rows")
    if r2.data:
        print(json.dumps(r2.data[0], indent=2, default=str))
except Exception as e:
    print(f"ERROR: {e}")

# Test 3: Check if scadenze_pagamento has 'categoria' column
print("\n=== Test scadenze_pagamento columns ===")
try:
    r3 = sb.table('scadenze_pagamento').select('*').limit(1).execute()
    if r3.data:
        cols = sorted(r3.data[0].keys())
        print(f"Columns: {cols}")
        has_categoria = 'categoria' in r3.data[0]
        has_fonte = 'fonte' in r3.data[0]
        has_auto_dom = 'auto_domiciliazione' in r3.data[0]
        has_data_pian = 'data_pianificata' in r3.data[0]
        print(f"  categoria: {has_categoria}")
        print(f"  fonte: {has_fonte}")
        print(f"  auto_domiciliazione: {has_auto_dom}")
        print(f"  data_pianificata: {has_data_pian}")
except Exception as e:
    print(f"ERROR: {e}")
