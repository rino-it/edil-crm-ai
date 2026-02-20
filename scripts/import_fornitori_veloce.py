import os
import re
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
from supabase import create_client, Client

# ============================================================
# CONFIGURAZIONE E CARICAMENTO AMBIENTE
# ============================================================

# Carica le variabili dal file .env.local posizionato nella root
load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Errore: Credenziali Supabase non trovate nel file .env.local")
    exit()

# Percorso cartella di rete
CARTELLA_ARCHIVIO = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_Fatto"

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"❌ Errore connessione Supabase: {e}")
    exit()

# ============================================================
# FUNZIONI UTILITY
# ============================================================

def pulisci_namespace(xml_content):
    """Rimuove i namespace XML per semplificare la ricerca dei tag via XPath."""
    xml_content = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
    xml_content = re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)
    return xml_content

def get_text(element, path):
    """Estrae il testo da un tag in modo sicuro, gestendo i valori nulli."""
    if element is None: return None
    found = element.find(path)
    return found.text.strip() if found is not None and found.text else None

# ============================================================
# CORE IMPORTAZIONE
# ============================================================

def run_import():
    print(f"🚀 Avvio importazione massiva da: {CARTELLA_ARCHIVIO}")
    
    if not os.path.exists(CARTELLA_ARCHIVIO):
        print(f"❌ Percorso non accessibile o inesistente.")
        return

    files = [f for f in os.listdir(CARTELLA_ARCHIVIO) if f.lower().endswith('.xml')]
    print(f"📂 Trovati {len(files)} file da analizzare.")
    print("-" * 50)

    for f in files:
        try:
            with open(os.path.join(CARTELLA_ARCHIVIO, f), 'r', encoding='utf-8', errors='ignore') as xml_file:
                raw_content = xml_file.read()
                if not raw_content.strip(): continue
                root = ET.fromstring(pulisci_namespace(raw_content))
            
            # --- SEZIONE CEDENTE (FORNITORE) ---
            cedente = root.find(".//CedentePrestatore")
            if cedente is None: continue

            anag = cedente.find(".//DatiAnagrafici")
            sede = cedente.find(".//Sede")
            contatti = cedente.find(".//Contatti")
            
            # 1. Identificativi Fiscali
            piva = get_text(anag, ".//IdCodice")
            cf = get_text(anag, ".//CodiceFiscale")
            
            # 2. Ragione Sociale (Gestione Società vs Professionisti)
            ragione_sociale = get_text(anag, ".//Denominazione")
            if not ragione_sociale:
                nome = get_text(anag, ".//Nome") or ""
                cognome = get_text(anag, ".//Cognome") or ""
                ragione_sociale = f"{cognome} {nome}".strip()
            
            # Fallback di sicurezza per non violare il NOT NULL del DB
            if not ragione_sociale and piva:
                ragione_sociale = f"Fornitore P.IVA {piva}"
            
            if not ragione_sociale: continue

            # 3. Indirizzo Sede Legale (Composto)
            indirizzo_db = None
            if sede is not None:
                via = get_text(sede, "Indirizzo") or ""
                civico = get_text(sede, "NumeroCivico") or ""
                cap = get_text(sede, "CAP") or ""
                comune = get_text(sede, "Comune") or ""
                prov = get_text(sede, "Provincia") or ""
                indirizzo_db = f"{via} {civico}, {cap} {comune} ({prov})".replace("  ", " ").strip(", ")

            # 4. Contatti
            email = get_text(contatti, "Email")
            telefono = get_text(contatti, "Telefono")

            # 5. Dati Bancari (IBAN)
            iban = get_text(root, ".//DatiPagamento/DettaglioPagamento/IBAN")

            # --- UPSERT DATABASE ---
            # Mappatura su tutte le colonne disponibili nella tabella
            supabase.table("anagrafica_soggetti").upsert({
                "tipo": "fornitore",
                "ragione_sociale": ragione_sociale,
                "partita_iva": piva,
                "codice_fiscale": cf,
                "indirizzo": indirizzo_db,
                "email": email,
                "telefono": telefono,
                "codice_sdi": "0000000",
                "iban": iban,
                "condizioni_pagamento": "30gg DFFM", # Valore di default standard
                "note": f"Importato automaticamente da file: {f}"
            }, on_conflict="partita_iva").execute()
            
            print(f"✅ Importato: {ragione_sociale}")

        except Exception as e:
            print(f"⚠️ Errore nel file {f}: {e}")

    print("-" * 50)
    print("✨ Importazione massiva completata. Ora le anagrafiche sono allineate.")

if __name__ == "__main__":
    run_import()