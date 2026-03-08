"""Debug TOP COPERTURE: perche' non ha scadenze?"""
import os
from dotenv import load_dotenv
load_dotenv('.env.local')
from supabase import create_client
sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# 1. Anagrafica
r = sb.table('anagrafica_soggetti').select('id,ragione_sociale,partita_iva').ilike('ragione_sociale', '%top coper%').execute()
print('=== ANAGRAFICA ===')
for s in r.data:
    sid = s['id']
    print(f"  id={sid[:12]} | {s['ragione_sociale']} | PIVA: {s.get('partita_iva')}")
    sc = sb.table('scadenze_pagamento').select('id,fattura_riferimento,data_emissione,importo_totale,stato,fonte').eq('soggetto_id', sid).execute()
    print(f"  -> Scadenze: {len(sc.data)}")
    for x in sc.data:
        print(f"     {x.get('fattura_riferimento')} | {x.get('data_emissione')} | EUR {x.get('importo_totale')} | {x.get('stato')} | {x.get('fonte')}")

# 2. Fatture fornitori
ff = sb.table('fatture_fornitori').select('id,soggetto_id,ragione_sociale,numero_fattura,data_fattura,importo_totale').ilike('ragione_sociale', '%top coper%').execute()
print(f"\n=== FATTURE_FORNITORI ({len(ff.data)}) ===")
for f in ff.data:
    print(f"  sogg_id={f['soggetto_id'][:12]} | {f['ragione_sociale']} | fatt={f['numero_fattura']} | {f.get('data_fattura')} | EUR {f.get('importo_totale')}")

# 3. Soggetto con PIVA dal XML (01641790702)
r2 = sb.table('anagrafica_soggetti').select('id,ragione_sociale,partita_iva').eq('partita_iva', '01641790702').execute()
print(f"\n=== SOGGETTO CON PIVA XML (01641790702) ===")
print(f"  Trovati: {len(r2.data)}")
for s in r2.data:
    print(f"  id={s['id'][:12]} | {s['ragione_sociale']} | PIVA: {s.get('partita_iva')}")

# 4. The fattura_fornitori soggetto_id — does it match the anagrafica id?
if ff.data:
    ff_sogg_id = ff.data[0]['soggetto_id']
    ana_ids = [s['id'] for s in r.data]
    print(f"\n=== MATCH CHECK ===")
    print(f"  fatture_fornitori.soggetto_id = {ff_sogg_id[:12]}")
    print(f"  anagrafica TOP COPERTURE ids  = {[x[:12] for x in ana_ids]}")
    print(f"  Match: {ff_sogg_id in ana_ids}")
    
    # What soggetto is linked?
    linked = sb.table('anagrafica_soggetti').select('id,ragione_sociale,partita_iva').eq('id', ff_sogg_id).execute()
    if linked.data:
        print(f"  Linked soggetto: {linked.data[0]['ragione_sociale']} | PIVA: {linked.data[0].get('partita_iva')}")
    else:
        print(f"  !! Soggetto {ff_sogg_id[:12]} NON ESISTE in anagrafica !!")
        
    # Scadenze for that soggetto
    sc2 = sb.table('scadenze_pagamento').select('id,fattura_riferimento,data_emissione,importo_totale,stato,fonte').eq('soggetto_id', ff_sogg_id).execute()
    print(f"  Scadenze per quel soggetto: {len(sc2.data)}")
    for x in sc2.data:
        print(f"     {x.get('fattura_riferimento')} | {x.get('data_emissione')} | EUR {x.get('importo_totale')} | {x.get('stato')} | {x.get('fonte')}")
