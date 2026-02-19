import os
import re
import xml.etree.ElementTree as ET
from supabase import create_client, Client

# ================= CONFIGURAZIONE =================

# 1. CREDENZIALI SUPABASE
SUPABASE_URL = "https://jnhpabgohnfdiqvjzjku.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuaHBhYmdvaG5mZGlxdmp6amt1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgxMjIxNSwiZXhwIjoyMDg2Mzg4MjE1fQ.DjTPDvDSa6KH33w8iuIgyo5tm-YZLtyAy2BT6XNyju4"

# 2. PERCORSO ARCHIVIO FATTO
# Assicurati che questo percorso sia corretto sul PC dove esegui lo script!
CARTELLA_ARCHIVIO = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_Fatto"

# ================= FINE CONFIGURAZIONE =================

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"❌ Errore connessione Supabase: {e}")
    exit()

def pulisci_namespace(xml_content):
    xml_content = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
    xml_content = re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)
    return xml_content

def estrai_ddt_da_descrizione(descrizione):
    """
    Cerca disperatamente un numero DDT dentro una stringa di testo.
    Es: "Rif. DDT 45 del 12/12" -> restituisce "45"
    """
    if not descrizione: return None
    # Regex potenziata: Cerca 'DDT', 'Doc', 'Bolla', 'Rif', 'nr' seguito da numeri
    match = re.search(r'(?:DDT|Doc|Bolla|Rif)\.?\s*(?:n\.?|nr\.?)?\s*0*(\d+)', descrizione, re.IGNORECASE)
    if match:
        return match.group(1)
    return None

def parse_and_upload(percorso_file):
    nome_file = os.path.basename(percorso_file)
    
    # Check preventivo
    try:
        res = supabase.table("fatture_fornitori").select("id").eq("nome_file_xml", nome_file).execute()
        if res.data and len(res.data) > 0:
            return 
    except: pass

    print(f"✨ Nuova fattura trovata: {nome_file} -> Caricamento...")

    try:
        with open(percorso_file, 'r', encoding='utf-8', errors='ignore') as f:
            xml_raw = f.read()
        
        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)

        # --- ESTRAZIONE HEADER ---
        header = root.find(".//FatturaElettronicaHeader")
        body = root.find(".//FatturaElettronicaBody")
        if header is None or body is None: return

        cedente = header.find(".//CedentePrestatore/DatiAnagrafici")
        ragione_sociale = cedente.find(".//Denominazione").text if cedente.find(".//Denominazione") is not None else "Sconosciuto"
        id_fiscale = cedente.find(".//IdFiscaleIVA/IdCodice")
        piva = id_fiscale.text if id_fiscale is not None else "00000000000"

        dati_gen = body.find(".//DatiGeneraliDocumento")
        numero_fattura = dati_gen.find("Numero").text
        data_fattura = dati_gen.find("Data").text
        importo_tag = dati_gen.find("ImportoTotaleDocumento")
        importo_totale = float(importo_tag.text) if importo_tag is not None else 0.0

        # --- INSERT TESTATA ---
        res_insert = supabase.table("fatture_fornitori").insert({
            "ragione_sociale": ragione_sociale,
            "piva_fornitore": piva,
            "numero_fattura": numero_fattura,
            "data_fattura": data_fattura,
            "importo_totale": importo_totale,
            "nome_file_xml": nome_file
        }).execute()
        
        if not res_insert.data: return
        fattura_id = res_insert.data[0]['id'] 

        # --- MAPPA DDT (LOGICA MULTI-DDT GLOBALE) ---
        ddt_line_map = {}
        ddt_globali = [] # Lista per accumulare tutti i DDT senza riferimento riga
        
        dati_ddt_list = body.findall(".//DatiDDT")
        
        if dati_ddt_list:
            for ddt_block in dati_ddt_list:
                num_ddt_tag = ddt_block.find("NumeroDDT")
                if num_ddt_tag is not None:
                    valore_ddt = num_ddt_tag.text
                    rifs = ddt_block.findall("RiferimentoNumeroLinea")
                    
                    if not rifs:
                        # Se NON ci sono riferimenti riga, è un DDT globale per questa fattura
                        ddt_globali.append(valore_ddt)
                    else:
                        # Se CI SONO riferimenti, mappa specificamente quelle righe
                        for r in rifs:
                            ddt_line_map[r.text] = valore_ddt
        
        # Uniamo tutti i DDT globali in una stringa (es. "13176,13535,13713")
        # Questo permette alla funzione SQL Fuzzy di trovarli tutti
        stringa_ddt_globali = ",".join(ddt_globali) if ddt_globali else None

        # --- DETTAGLIO RIGHE ---
        righe_da_caricare = []
        dettaglio_linee = body.findall(".//DettaglioLinee")

        for linea in dettaglio_linee:
            try:
                num_linea = linea.find("NumeroLinea").text
                descrizione = linea.find("Descrizione").text if linea.find("Descrizione") is not None else ""
                
                qty_tag = linea.find("Quantita")
                qty = float(qty_tag.text) if qty_tag is not None else 0.0
                
                prezzo_tag = linea.find("PrezzoTotale")
                prezzo = float(prezzo_tag.text) if prezzo_tag is not None else 0.0
                
                um_tag = linea.find("UnitaMisura")
                um = um_tag.text if um_tag is not None else ""

                # 1. Cerca nel link strutturato (priorità alta)
                ddt_assegnato = ddt_line_map.get(num_linea)

                # 2. Se vuoto, usa i DDT globali separati da virgola (Fix Edilcommercio)
                if not ddt_assegnato and stringa_ddt_globali:
                    ddt_assegnato = stringa_ddt_globali
                
                # 3. Fallback sul testo della descrizione (Regex migliorata)
                if not ddt_assegnato:
                    ddt_assegnato = estrai_ddt_da_descrizione(descrizione)

                righe_da_caricare.append({
                    "fattura_id": fattura_id,
                    "numero_linea": int(num_linea) if num_linea.isdigit() else 0,
                    "descrizione": descrizione,
                    "quantita": qty,
                    "unita_misura": um,
                    "prezzo_totale": prezzo,
                    "ddt_riferimento": ddt_assegnato
                })
            except: continue

        if righe_da_caricare:
            supabase.table("fatture_dettaglio_righe").insert(righe_da_caricare).execute()
            print(f"   ✅ Caricate {len(righe_da_caricare)} righe.")

    except Exception as e:
        print(f"   ❌ Errore su {nome_file}: {e}")

def run():
    print(f"🚀 AVVIO IMPORTAZIONE DA: {CARTELLA_ARCHIVIO}")
    
    if not os.path.exists(CARTELLA_ARCHIVIO):
        print(f"❌ Cartella non trovata: {CARTELLA_ARCHIVIO}")
        return

    files = [f for f in os.listdir(CARTELLA_ARCHIVIO) if f.lower().endswith('.xml')]
    
    if not files:
        print(f"⚠️ Nessun file XML trovato in Archivio_Fatto.")
        return

    print(f"📂 Trovati {len(files)} file totali in archivio.")
    print("⏳ Controllo quali mancano su Supabase...")
    print("-" * 50)

    count = 0
    for f in files:
        full_path = os.path.join(CARTELLA_ARCHIVIO, f)
        parse_and_upload(full_path)
        count += 1

    print("-" * 50)
    print(f"✅ FINITO IMPORTAZIONE. Elaborati {count} file.")

if __name__ == "__main__":
    run()