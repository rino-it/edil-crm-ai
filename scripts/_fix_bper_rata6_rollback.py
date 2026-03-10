"""Fix: rollback rata #6 BPER (segnata pagata per errore) e aggiorna rata #5 con importo effettivo."""
import os
import sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
EXECUTE = "--execute" in sys.argv

# Trova mutuo BPER
mutui = sb.table("mutui").select("id, banca_erogante").execute().data
bper = [m for m in mutui if 'BPER' in (m.get('banca_erogante') or '').upper()]
bper_id = bper[0]['id']
print(f"Mutuo BPER: {bper_id[:8]}")

# Prendi rata #5 e #6
rate = sb.table("rate_mutuo") \
    .select("id, numero_rata, importo_rata, data_scadenza, stato, data_pagamento, movimento_banca_id, importo_effettivo, scadenza_id") \
    .eq("mutuo_id", bper_id) \
    .in_("numero_rata", [5, 6]) \
    .order("numero_rata", desc=False) \
    .execute().data

for r in rate:
    mov = str(r.get('movimento_banca_id',''))[:8] if r.get('movimento_banca_id') else '-'
    print(f"  #{r['numero_rata']} EUR {r['importo_rata']} scad={r['data_scadenza'][:10]} stato={r['stato']} pag={r.get('data_pagamento') or '-'} mov={mov} eff={r.get('importo_effettivo') or '-'} scad_id={str(r.get('scadenza_id') or '-')[:8]}")

rata5 = next((r for r in rate if r['numero_rata'] == 5), None)
rata6 = next((r for r in rate if r['numero_rata'] == 6), None)

if not rata5 or not rata6:
    print("Rate #5 o #6 non trovate!")
    sys.exit(1)

# Il movimento che era stato erroneamente collegato alla rata #6
mov_id = rata6.get('movimento_banca_id')

print(f"\nAzioni:")
print(f"  1. Rata #6 -> da_pagare (rollback importo a 6537.13)")
print(f"  2. Rata #5 -> aggiorna importo_rata={rata6.get('importo_rata')} e importo_effettivo, collega movimento")

if not EXECUTE:
    print(f"\nDRY-RUN. Esegui con --execute per applicare.")
    sys.exit(0)

# 1. Rollback rata #6
sb.table("rate_mutuo").update({
    "stato": "da_pagare",
    "data_pagamento": None,
    "movimento_banca_id": None,
    "importo_effettivo": None,
    "importo_rata": 6537.13,  # ripristina importo preventivato
}).eq("id", rata6['id']).execute()
print(f"  OK: Rata #6 -> da_pagare (importo_rata ripristinato a 6537.13)")

# Rollback scadenza di rata #6
if rata6.get('scadenza_id'):
    sb.table("scadenze_pagamento").update({
        "stato": "da_pagare",
        "importo_pagato": 0,
        "data_pagamento": None,
    }).eq("id", rata6['scadenza_id']).execute()
    print(f"  OK: Scadenza rata #6 -> da_pagare")

# 2. Aggiorna rata #5 con importo effettivo e movimento
if mov_id:
    sb.table("rate_mutuo").update({
        "importo_rata": 6540.63,
        "importo_effettivo": 6540.63,
        "movimento_banca_id": mov_id,
    }).eq("id", rata5['id']).execute()
    print(f"  OK: Rata #5 -> importo_rata=6540.63, movimento collegato")

    # Aggiorna anche la scadenza della rata #5
    if rata5.get('scadenza_id'):
        sb.table("scadenze_pagamento").update({
            "importo_totale": 6540.63,
            "importo_pagato": 6540.63,
        }).eq("id", rata5['scadenza_id']).execute()
        print(f"  OK: Scadenza rata #5 -> importo aggiornato a 6540.63")

    # Aggiorna movimento banca con scadenza rata #5
    sb.table("movimenti_banca").update({
        "scadenza_id": rata5.get('scadenza_id'),
        "categoria_dedotta": "rata_mutuo",
    }).eq("id", mov_id).execute()
    print(f"  OK: Movimento -> collegato a scadenza rata #5")

print("\nFatto.")
