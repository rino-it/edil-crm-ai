import os
from dotenv import load_dotenv
from supabase import create_client, Client
from thefuzz import fuzz

# ================= CONFIGURAZIONE =================
load_dotenv(dotenv_path="../.env.local")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Soglia di confidenza: se la somiglianza è inferiore a 75/100, non assegna per sicurezza
SOGLIA_SICUREZZA = 75 

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# ==================================================

def run_assignment():
    print("🚀 Avvio Assegnazione Automatica Cantieri alle Spese...")

    # 1. Recupera tutti i cantieri attivi
    res_cantieri = supabase.table("cantieri").select("id, nome").neq("stato", "chiuso").execute()
    cantieri = res_cantieri.data
    
    if not cantieri:
        print("❌ Nessun cantiere attivo trovato nel DB. Creane qualcuno nella WebApp prima.")
        return

    print(f"📋 Trovati {len(cantieri)} cantieri attivi per il confronto.")

    # 2. Recupera le scadenze NON ancora assegnate (cantiere_id is null)
    # Prendiamo solo quelle di tipo 'uscita' (costi) o 'entrata' (ricavi)
    res_scadenze = supabase.table("scadenze_pagamento") \
        .select("id, descrizione, fattura_riferimento, note, importo_totale") \
        .is_("cantiere_id", "null") \
        .execute()
    
    scadenze = res_scadenze.data
    print(f"🔍 Analisi di {len(scadenze)} scadenze non assegnate...")

    assegnati = 0
    ignorati = 0

    for s in scadenze:
        testo_da_analizzare = f"{s['descrizione'] or ''} {s['note'] or ''} {s['fattura_riferimento'] or ''}".lower()
        
        miglior_match = None
        miglior_score = 0

        # Cerca quale cantiere viene menzionato nel testo della fattura
        for c in cantieri:
            nome_cantiere = c['nome'].lower()
            
            # A. Match Diretto (se il nome cantiere è contenuto nel testo)
            if nome_cantiere in testo_da_analizzare:
                miglior_score = 100
                miglior_match = c
                break
            
            # B. Match Fuzzy (se c'è un errore di battitura o abbreviazione)
            # Usiamo partial_ratio per trovare la stringa dentro la stringa
            score = fuzz.partial_ratio(nome_cantiere, testo_da_analizzare)
            if score > miglior_score:
                miglior_score = score
                miglior_match = c

        # Se abbiamo trovato un match affidabile
        if miglior_match and miglior_score >= SOGLIA_SICUREZZA:
            print(f"✅ MATCH! Scadenza '{s['descrizione'][:30]}...' -> Cantiere: '{miglior_match['nome']}' (Score: {miglior_score})")
            
            # Aggiorna il DB
            supabase.table("scadenze_pagamento").update({
                "cantiere_id": miglior_match['id']
            }).eq("id", s['id']).execute()
            
            assegnati += 1
        else:
            ignorati += 1

    print("-" * 50)
    print(f"🏁 Operazione completata.")
    print(f"🔗 Assegnati con successo: {assegnati}")
    print(f"🤷 Rimasti non assegnati (testo generico): {ignorati}")

if __name__ == "__main__":
    run_assignment()