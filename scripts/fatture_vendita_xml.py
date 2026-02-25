import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

# Carica le variabili d'ambiente (.env locale)
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Usiamo la service key per bypassare RLS nello script backend

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY non trovati nel file .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def strip_namespaces(xml_string):
    """Rimuove i namespace XML per facilitare la ricerca dei nodi (FatturaPA ha namespace fastidiosi)."""
    import re
    return re.sub(' xmlns="[^"]+"', '', xml_string, count=1)

def parse_e_importa_fattura(file_path):
    print(f"\n📄 Elaborazione: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        xml_content = f.read()
    
    # Pulizia e Parsing
    clean_xml = strip_namespaces(xml_content)
    root = ET.fromstring(clean_xml)

    # 1. ESTRAZIONE DATI CLIENTE (CessionarioCommittente)
    cessionario = root.find('.//CessionarioCommittente/DatiAnagrafici')
    if cessionario is None:
        print("❌ Cessionario non trovato. Saltata.")
        return

    piva_cliente = cessionario.findtext('.//IdFiscaleIVA/IdCodice')
    codice_fiscale = cessionario.findtext('.//CodiceFiscale')
    
    anagrafica = cessionario.find('.//Anagrafica')
    ragione_sociale = anagrafica.findtext('Denominazione')
    if not ragione_sociale:
        nome = anagrafica.findtext('Nome', '')
        cognome = anagrafica.findtext('Cognome', '')
        ragione_sociale = f"{nome} {cognome}".strip()

    # 2. UPSERT ANAGRAFICA SOGGETTO
    # Cerchiamo se esiste già, altrimenti creiamo
    soggetto_query = supabase.table('anagrafica_soggetti').select('id').eq('partita_iva', piva_cliente).execute()
    soggetto_id = None
    
    if len(soggetto_query.data) > 0:
        soggetto_id = soggetto_query.data[0]['id']
        print(f"✅ Soggetto trovato: {ragione_sociale}")
    else:
        # Crea nuovo cliente
        nuovo_soggetto = {
            "ragione_sociale": ragione_sociale,
            "partita_iva": piva_cliente,
            "codice_fiscale": codice_fiscale,
            "tipo": "cliente"
        }
        res = supabase.table('anagrafica_soggetti').insert(nuovo_soggetto).execute()
        soggetto_id = res.data[0]['id']
        print(f"🌟 Nuovo soggetto creato: {ragione_sociale}")

    # 3. ESTRAZIONE DATI FATTURA
    dati_generali = root.find('.//DatiGeneraliDocumento')
    numero_fattura = dati_generali.findtext('Numero')
    data_fattura = dati_generali.findtext('Data')
    importo_totale = float(dati_generali.findtext('ImportoTotaleDocumento', '0'))
    
    # Cerchiamo i dati DDT se presenti (utile per il Cantiere in Fase 4.5)
    dati_ddt = root.find('.//DatiDDT')
    numero_ddt = dati_ddt.findtext('NumeroDDT') if dati_ddt is not None else None

    # Verifica se fattura già importata
    check_fattura = supabase.table('fatture_vendita').select('id').eq('numero_fattura', numero_fattura).eq('soggetto_id', soggetto_id).execute()
    if len(check_fattura.data) > 0:
        print(f"⚠️ Fattura {numero_fattura} già importata. Ignoro.")
        return

    # 4. INSERIMENTO FATTURA VENDITA
    nuova_fattura = {
        "ragione_sociale": ragione_sociale,
        "piva_cliente": piva_cliente,
        "numero_fattura": numero_fattura,
        "data_fattura": data_fattura,
        "importo_totale": importo_totale,
        "soggetto_id": soggetto_id,
        "nome_file_xml": os.path.basename(file_path)
    }
    
    res_fatt = supabase.table('fatture_vendita').insert(nuova_fattura).execute()
    fattura_id = res_fatt.data[0]['id']

    # 5. ESTRAZIONE E INSERIMENTO RIGHE + MATCH DDT
    linee = root.findall('.//DettaglioLinee')
    righe_da_inserire = []
    
    for linea in linee:
        righe_da_inserire.append({
            "fattura_id": fattura_id,
            "descrizione": linea.findtext('Descrizione'),
            "quantita": float(linea.findtext('Quantita', '1')),
            "prezzo_unitario": float(linea.findtext('PrezzoUnitario', '0')),
            "importo": float(linea.findtext('PrezzoTotale', '0')),
            "codice_articolo": linea.findtext('.//CodiceValore', None),
            "ddt_riferimento": numero_ddt # Assegniamo il DDT generale alla riga
        })
    
    if righe_da_inserire:
        supabase.table('fatture_vendita_righe').insert(righe_da_inserire).execute()

    # 6. AUTO-GENERAZIONE SCADENZA (Credito da incassare)
    # Cerchiamo la data di scadenza reale in DatiPagamento, altrimenti +30gg
    dati_pagamento = root.find('.//DettaglioPagamento')
    data_scadenza = dati_pagamento.findtext('DataScadenzaPagamento') if dati_pagamento is not None else None
    
    if not data_scadenza:
        # Default: 30 giorni data fattura se non specificata
        dt_fattura = datetime.strptime(data_fattura, "%Y-%m-%d")
        data_scadenza = (dt_fattura + timedelta(days=30)).strftime("%Y-%m-%d")

    nuova_scadenza = {
        "soggetto_id": soggetto_id,
        "fattura_vendita_id": fattura_id,
        "fattura_riferimento": numero_fattura,
        "importo_totale": importo_totale,
        "importo_pagato": 0,
        "data_emissione": data_fattura,
        "data_scadenza": data_scadenza,
        "tipo": "entrata",
        "stato": "da_pagare",
        "descrizione": f"Fattura di Vendita n. {numero_fattura}"
    }
    
    res_scadenza = supabase.table('scadenze_pagamento').insert(nuova_scadenza).execute()
    scadenza_id = res_scadenza.data[0]['id']

    # Aggiorna la fattura con l'ID della scadenza generata
    supabase.table('fatture_vendita').update({"scadenza_id": scadenza_id}).eq('id', fattura_id).execute()

    print(f"✅ Inserita Fattura {numero_fattura} (€{importo_totale}) e generata Scadenza (Entrata).")


def processa_cartella_fatture(cartella='./xml_fatture_vendita'):
    if not os.path.exists(cartella):
        print(f"Cartella {cartella} non trovata. Creala e inserisci i file XML.")
        return
        
    file_xml = [f for f in os.listdir(cartella) if f.lower().endswith('.xml')]
    print(f"Trovati {len(file_xml)} file XML da elaborare.")
    
    for f in file_xml:
        parse_e_importa_fattura(os.path.join(cartella, f))

if __name__ == "__main__":
    processa_cartella_fatture()