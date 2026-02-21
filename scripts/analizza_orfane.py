import os
from dotenv import load_dotenv
from supabase import create_client, Client

# ================= CONFIGURAZIONE =================
load_dotenv(dotenv_path="../.env.local")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# ==================================================

def run_analisi():
    print("🔍 Analisi delle fatture non assegnate in corso...\n")
    
    # Recupera le scadenze orfane, unendo il nome del fornitore
    res = supabase.table("scadenze_pagamento") \
        .select("id, descrizione, anagrafica_soggetti(ragione_sociale)") \
        .is_("cantiere_id", "null") \
        .execute()
    
    dati = res.data
    if not dati:
        print("✅ Nessuna fattura orfana trovata.")
        return

    # Raggruppa i dati per fornitore
    report = {}
    for d in dati:
        # Estrai il nome (gestendo eventuali record senza anagrafica)
        soggetto = d.get('anagrafica_soggetti')
        fornitore = soggetto.get('ragione_sociale') if isinstance(soggetto, dict) else "Sconosciuto"
        
        desc = d.get('descrizione') or "Vuota"

        if fornitore not in report:
            report[fornitore] = {'conteggio': 0, 'esempi': set()}
            
        report[fornitore]['conteggio'] += 1
        
        # Salva un paio di descrizioni uniche per darti il contesto
        if len(report[fornitore]['esempi']) < 3:
            report[fornitore]['esempi'].add(desc[:50].replace('\n', ' '))

    # Ordina i fornitori partendo da quello con più fatture
    report_ordinato = sorted(report.items(), key=lambda x: x[1]['conteggio'], reverse=True)

    print(f"📊 TROVATI {len(report.keys())} FORNITORI CON FATTURE DA SMISTARE (Totale: {len(dati)} righe):\n")
    print("-" * 70)
    
    # Mostra i primi 40 fornitori più impattanti
    for fornitore, info in report_ordinato[:40]:
        desc_testo = " | ".join(info['esempi'])
        print(f"🏢 {fornitore}  👉  {info['conteggio']} fatture")
        print(f"   ↳ Vede questo testo: {desc_testo}")
        print("-" * 70)

if __name__ == "__main__":
    run_analisi()