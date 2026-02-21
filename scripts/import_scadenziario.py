import os
import math
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from thefuzz import process
from supabase import create_client, Client

# ================= CONFIGURAZIONE =================
load_dotenv(dotenv_path="../.env.local")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

FILE_EXCEL = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\EV - AMMINISTRAZIONE.xlsx"
NOME_FOGLIO_TARGET = "MAIN"
SOGLIA_MATCH = 85

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
# ==================================================

def format_date(val):
    if pd.isna(val): return None
    try:
        return val.strftime("%Y-%m-%d")
    except:
        return None

def pulisci_testo(val):
    testo = str(val).strip()
    return "" if testo.lower() == 'nan' else testo

def run_import():
    print(f"📂 Lettura file: {FILE_EXCEL}")
    if not os.path.exists(FILE_EXCEL):
        print("❌ File non trovato.")
        return

    res = supabase.table("anagrafica_soggetti").select("id, ragione_sociale").execute()
    dizionario_nomi = {row['ragione_sociale']: row['id'] for row in res.data}
    nomi_db = list(dizionario_nomi.keys())

    try:
        xls = pd.ExcelFile(FILE_EXCEL)
        foglio_corretto = next((f for f in xls.sheet_names if f.strip().upper() == NOME_FOGLIO_TARGET.upper()), None)
        
        if not foglio_corretto:
            print(f"❌ Impossibile trovare il foglio '{NOME_FOGLIO_TARGET}'.")
            return
            
        df = pd.read_excel(xls, sheet_name=foglio_corretto, usecols="B:G,I:J", header=0)
    except Exception as e:
        print(f"❌ Errore lettura Excel: {e}")
        return

    print(f"📊 Trovate {len(df)} righe dati. Inizio elaborazione...\n")

    contatori = {"inserite": 0, "aggiornate": 0, "errori": 0}
    fornitori_mancanti = {}

    for index, row in df.iterrows():
        riga_reale = index + 2
        fornitore_excel = pulisci_testo(row.iloc[0])
        if not fornitore_excel: continue

        # --- MATCHING FORNITORE ---
        match_result = process.extractOne(fornitore_excel, nomi_db)
        if not match_result or match_result[1] < SOGLIA_MATCH:
            fornitori_mancanti[fornitore_excel] = fornitori_mancanti.get(fornitore_excel, 0) + 1
            continue
        
        soggetto_id = dizionario_nomi[match_result[0]]

        # --- ESTRAZIONE DATI PULITI (CON FALLBACK DATE) ---
        num_fattura = pulisci_testo(row.iloc[1]) or f"EXCEL-R{riga_reale}"
        data_emi = format_date(row.iloc[2])
        data_scad_raw = format_date(row.iloc[3])
        
        # Logica di salvataggio estremo per le date mancanti
        if data_scad_raw:
            data_scad = data_scad_raw
        elif data_emi:
            data_scad = data_emi
        else:
            # Fallback: se mancano tutte le date (es. "In attesa di fattura"), mettiamo oggi
            data_scad = datetime.now().strftime("%Y-%m-%d")
            # Aggiungiamo un avviso nella riga per permetterti di identificarla dopo
            num_fattura = f"{num_fattura} (NO DATA)"
            
        str_pagato = pulisci_testo(row.iloc[4]).lower()
        is_pagato = 'x' in str_pagato
        
        try:
            importo_raw = pulisci_testo(row.iloc[5]).replace('€','').replace(',','.')
            importo = float(importo_raw)
            if math.isnan(importo): importo = 0.0
        except: importo = 0.0

        descrizione = pulisci_testo(row.iloc[6]) or "Storico Excel"
        metodo = pulisci_testo(row.iloc[7]) or "N/D"

        if is_pagato:
            stato = "pagato"
            data_pag = data_scad
        else:
            data_pag = None
            if data_scad and data_scad < datetime.now().strftime("%Y-%m-%d"): stato = "scaduto"
            else: stato = "da_pagare"

        payload = {
            "tipo": "uscita",
            "soggetto_id": soggetto_id,
            "fattura_riferimento": num_fattura,
            "importo_totale": importo,
            "importo_pagato": importo if is_pagato else 0.0,
            "data_emissione": data_emi,
            "data_scadenza": data_scad,
            "data_pagamento": data_pag,
            "stato": stato,
            "descrizione": descrizione,
            "metodo_pagamento": metodo,
            "note": "Importato da Excel"
        }

        # --- LOGICA DI INSERIMENTO/AGGIORNAMENTO ESPLICITA ---
        try:
            # 1. Controlla se esiste già
            check = supabase.table("scadenze_pagamento").select("id").eq("soggetto_id", soggetto_id).eq("fattura_riferimento", num_fattura).execute()
            
            if len(check.data) > 0:
                # Esiste -> Aggiorna
                id_esistente = check.data[0]['id']
                supabase.table("scadenze_pagamento").update(payload).eq("id", id_esistente).execute()
                contatori["aggiornate"] += 1
            else:
                # Non esiste -> Inserisci
                supabase.table("scadenze_pagamento").insert(payload).execute()
                contatori["inserite"] += 1

        except Exception as e:
            print(f"⚠️ Errore salvataggio riga {riga_reale} ({fornitore_excel}): {e}")
            contatori["errori"] += 1

    print("-" * 50)
    print(f"✅ Nuove scadenze inserite: {contatori['inserite']}")
    print(f"🔄 Scadenze aggiornate: {contatori['aggiornate']}")
    
    if contatori['errori'] > 0:
        print(f"⚠️ Errori di salvataggio: {contatori['errori']}")
    
    if fornitori_mancanti:
        print(f"\n❌ Non importate per fornitore mancante: {sum(fornitori_mancanti.values())}")

if __name__ == "__main__":
    run_import()