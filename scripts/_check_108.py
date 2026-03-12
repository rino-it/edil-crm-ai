import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

res = sb.table("scadenze_pagamento").select("*").ilike("fattura_riferimento", "%108%").eq("tipo", "uscita").execute()
for s in res.data:
    imp = s.get('importo_totale') or 0
    pag = s.get('importo_pagato') or 0
    if abs(imp - 723.22) < 1 or "108/2026" in str(s.get('fattura_riferimento','')):
        anag = sb.table("anagrafica_soggetti").select("ragione_sociale").eq("id", s.get("soggetto_id","")).execute()
        nome = anag.data[0]["ragione_sociale"] if anag.data else "?"
        print(f"ID: {s['id']}")
        print(f"  Fornitore: {nome}")
        print(f"  Fattura: {s.get('fattura_riferimento')}")
        print(f"  Importo: {imp}")
        print(f"  Pagato: {pag}")
        print(f"  Stato: {s.get('stato')}")
        print(f"  Fonte: {s.get('fonte')}")
        print(f"  Data emissione: {s.get('data_emissione')}")
        print(f"  Data scadenza: {s.get('data_scadenza')}")
        print(f"  Data pagamento: {s.get('data_pagamento')}")
        print(f"  Metodo: {s.get('metodo_pagamento')}")
        print(f"  Note: {s.get('note')}")
        print()
