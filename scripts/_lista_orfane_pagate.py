"""Lista completa delle 216 scadenze fonte=fattura, stato=pagato, senza data_pagamento."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

all_data, offset = [], 0
while True:
    batch = sb.table("scadenze_pagamento") \
        .select("id, fattura_riferimento, importo_totale, importo_pagato, stato, fonte, data_emissione, data_scadenza, data_pagamento, soggetto_id, anagrafica_soggetti(ragione_sociale)") \
        .eq("fonte", "fattura") \
        .eq("stato", "pagato") \
        .eq("tipo", "uscita") \
        .is_("data_pagamento", "null") \
        .order("data_scadenza", desc=False) \
        .range(offset, offset + 999) \
        .execute().data or []
    all_data.extend(batch)
    if len(batch) < 1000:
        break
    offset += 1000

print(f"Scadenze fonte=fattura, stato=pagato, data_pagamento=NULL: {len(all_data)}")
print(f"{'#':>4}  {'Fornitore':<45} {'Fattura':<25} {'Importo':>10} {'Emissione':>12} {'Scadenza':>12}")
print(f"{'-'*4}  {'-'*45} {'-'*25} {'-'*10} {'-'*12} {'-'*12}")

totale = 0
for i, s in enumerate(all_data, 1):
    sog = s.get('anagrafica_soggetti') or {}
    nome = sog.get('ragione_sociale') or '???'
    importo = s.get('importo_totale') or 0
    totale += importo
    fatt = s.get('fattura_riferimento') or '-'
    em = s.get('data_emissione') or '-'
    sc = s.get('data_scadenza') or '-'
    try:
        print(f"{i:>4}  {nome[:45]:<45} {fatt[:25]:<25} {importo:>10.2f} {em:>12} {sc:>12}")
    except UnicodeEncodeError:
        print(f"{i:>4}  {nome[:45].encode('ascii','replace').decode():<45} {fatt[:25]:<25} {importo:>10.2f} {em:>12} {sc:>12}")

print(f"\n{'':>4}  {'TOTALE':<45} {'':25} {totale:>10.2f}")

# Riepilogo per fornitore
per_forn = {}
for s in all_data:
    sog = s.get('anagrafica_soggetti') or {}
    nome = sog.get('ragione_sociale') or '???'
    importo = s.get('importo_totale') or 0
    if nome not in per_forn:
        per_forn[nome] = {'n': 0, 'tot': 0}
    per_forn[nome]['n'] += 1
    per_forn[nome]['tot'] += importo

print(f"\n\nRIEPILOGO PER FORNITORE:")
print(f"{'Fornitore':<45} {'N':>4} {'Totale':>12}")
print(f"{'-'*45} {'-'*4} {'-'*12}")
for nome, v in sorted(per_forn.items(), key=lambda x: -x[1]['tot']):
    try:
        print(f"{nome[:45]:<45} {v['n']:>4} {v['tot']:>12.2f}")
    except UnicodeEncodeError:
        print(f"{nome[:45].encode('ascii','replace').decode():<45} {v['n']:>4} {v['tot']:>12.2f}")
print(f"{'TOTALE':<45} {len(all_data):>4} {totale:>12.2f}")
