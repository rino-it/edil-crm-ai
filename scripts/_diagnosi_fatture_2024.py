"""
Diagnostica: verifica fatture del 2024 presenti in fatture_fornitori
e le relative righe dettaglio e scadenze.
"""
import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=== FATTURE FORNITORI CON DATA 2024 ===")
res = supabase.table("fatture_fornitori").select(
    "id, numero_fattura, data_fattura, ragione_sociale, importo_totale, nome_file_xml"
).gte("data_fattura", "2024-01-01").lte("data_fattura", "2024-12-31").execute()

fatture_2024 = res.data or []
print(f"Trovate: {len(fatture_2024)} fatture con data_fattura nel 2024\n")

if not fatture_2024:
    print("Nessuna fattura 2024 nel DB. Il problema potrebbe essere altrove.")
    sys.exit(0)

for f in fatture_2024:
    print(f"  [{f['id'][:8]}] {f['numero_fattura']} del {f['data_fattura']} - {f['ragione_sociale']} - EUR {f['importo_totale']}")
    print(f"           XML: {f.get('nome_file_xml', 'N/A')}")

fattura_ids = [f["id"] for f in fatture_2024]

print(f"\n=== RIGHE DETTAGLIO ASSOCIATE ===")
tot_righe = 0
for fid in fattura_ids:
    righe = supabase.table("fatture_dettaglio_righe").select("id").eq("fattura_id", fid).execute()
    n = len(righe.data or [])
    tot_righe += n
print(f"Totale righe dettaglio per fatture 2024: {tot_righe}")

print(f"\n=== SCADENZE CON fonte='fattura' E data_emissione 2024 ===")
sc_res = supabase.table("scadenze_pagamento").select(
    "id, fattura_riferimento, data_emissione, importo, soggetto_id, fonte, fattura_fornitore_id"
).gte("data_emissione", "2024-01-01").lte("data_emissione", "2024-12-31").eq("fonte", "fattura").execute()

scadenze_2024 = sc_res.data or []
print(f"Trovate: {len(scadenze_2024)} scadenze con fonte='fattura' e data_emissione 2024")

for s in scadenze_2024[:20]:
    print(f"  [{s['id'][:8]}] {s['fattura_riferimento']} del {s['data_emissione']} - EUR {s['importo']} - FK: {s.get('fattura_fornitore_id', 'N/A')}")

if len(scadenze_2024) > 20:
    print(f"  ... e altre {len(scadenze_2024) - 20}")

print("\n=== RIEPILOGO ===")
print(f"Fatture fornitori 2024: {len(fatture_2024)}")
print(f"Righe dettaglio associate: {tot_righe}")
print(f"Scadenze fonte='fattura' 2024: {len(scadenze_2024)}")
