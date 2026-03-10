"""
Sincronizza rate_mutuo -> scadenze_pagamento
Crea le scadenze mancanti per ogni rata da_pagare senza scadenza_id
"""
import os, json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Fetch rate orfane con join mutui
r = sb.table('rate_mutuo').select(
    'id, mutuo_id, numero_rata, importo_rata, data_scadenza, stato, '
    'mutui!inner(id, conto_banca_id, banca_erogante, scopo, soggetto_id, numero_rate)'
).eq('stato', 'da_pagare').is_('scadenza_id', 'null').execute()

print(f"Rate orfane da sincronizzare: {len(r.data)}")
count = 0
errors = 0

for rata in r.data:
    mutuo = rata['mutui']
    
    # Check difensivo: esiste gia scadenza corrispondente?
    existing = sb.table('scadenze_pagamento').select('id').eq(
        'fonte', 'mutuo'
    ).eq('categoria', 'rata_mutuo').eq(
        'importo_totale', rata['importo_rata']
    ).eq('data_scadenza', rata['data_scadenza']).neq(
        'stato', 'pagato'
    ).limit(1).execute()
    
    if existing.data:
        # Link solo
        sb.table('rate_mutuo').update({'scadenza_id': existing.data[0]['id']}).eq('id', rata['id']).execute()
        count += 1
        print(f"  [LINK] Rata #{rata['numero_rata']} -> scadenza esistente {existing.data[0]['id'][:8]}")
        continue
    
    # Crea scadenza
    scopo = f" - {mutuo['scopo']}" if mutuo.get('scopo') else ""
    desc = f"Rata {rata['numero_rata']}/{mutuo['numero_rate']} mutuo {mutuo['banca_erogante']}{scopo}"
    
    try:
        sc = sb.table('scadenze_pagamento').insert({
            'descrizione': desc,
            'importo_totale': rata['importo_rata'],
            'importo_pagato': 0,
            'data_scadenza': rata['data_scadenza'],
            'data_pianificata': rata['data_scadenza'],
            'tipo': 'uscita',
            'stato': 'da_pagare',
            'categoria': 'rata_mutuo',
            'soggetto_id': mutuo.get('soggetto_id'),
            'fonte': 'mutuo',
            'auto_domiciliazione': True,
        }).execute()
        
        scadenza_id = sc.data[0]['id']
        
        # Collega rata -> scadenza
        sb.table('rate_mutuo').update({'scadenza_id': scadenza_id}).eq('id', rata['id']).execute()
        
        count += 1
        print(f"  [NEW] Rata #{rata['numero_rata']} {mutuo['banca_erogante']}{scopo} | {rata['importo_rata']} EUR | scad {rata['data_scadenza']} -> {scadenza_id[:8]}")
    except Exception as e:
        errors += 1
        print(f"  [ERR] Rata #{rata['numero_rata']}: {e}")

print(f"\nRisultato: {count} sincronizzate, {errors} errori")
