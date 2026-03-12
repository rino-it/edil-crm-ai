# coding: utf-8
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

def safe_print(msg):
    try: print(msg)
    except UnicodeEncodeError: print(msg.encode('ascii','replace').decode())

# Trova soggetto Piazzoni
res = sb.table("anagrafica_soggetti").select("id,ragione_sociale").ilike("ragione_sociale", "%piazzon%").execute()
for r in res.data:
    safe_print(f"Soggetto: {r['ragione_sociale']} -> {r['id']}")
    scad = sb.table("scadenze_pagamento").select(
        "id,fattura_riferimento,importo_totale,importo_pagato,stato,fonte,data_scadenza,data_emissione"
    ).eq("soggetto_id", r["id"]).execute()
    for s in sorted(scad.data, key=lambda x: (x.get("fonte") or "", x.get("fattura_riferimento") or "")):
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        fonte = s.get('fonte') or 'null'
        fatt = str(s.get('fattura_riferimento') or '')[:25]
        imp = s.get('importo_totale') or 0
        pag = s.get('importo_pagato') or 0
        safe_print(f"  fonte={fonte:10} fatt={fatt:<25} imp={imp:>10,.2f} pag={pag:>10,.2f} res={residuo:>10,.2f} stato={s.get('stato')}")

# Anche belloli
safe_print("\n---")
res2 = sb.table("anagrafica_soggetti").select("id,ragione_sociale").ilike("ragione_sociale", "%bellol%").execute()
for r in res2.data:
    safe_print(f"Soggetto: {r['ragione_sociale']} -> {r['id']}")
    scad = sb.table("scadenze_pagamento").select(
        "id,fattura_riferimento,importo_totale,importo_pagato,stato,fonte,data_scadenza"
    ).eq("soggetto_id", r["id"]).order("fattura_riferimento").execute()
    for s in sorted(scad.data, key=lambda x: (x.get("fonte") or "", x.get("fattura_riferimento") or "")):
        residuo = (s.get("importo_totale") or 0) - (s.get("importo_pagato") or 0)
        if s.get("stato") in ("da_pagare","scaduto","scaduta","da_smistare","parziale"):
            safe_print(f"  fonte={s.get('fonte','null'):10} fatt={str(s.get('fattura_riferimento',''))[:25]:<25} imp={s.get('importo_totale'):>10,.2f} res={residuo:>10,.2f} stato={s.get('stato')}")
