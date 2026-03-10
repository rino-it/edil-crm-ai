import os
import re
import sys
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import calendar
from dotenv import load_dotenv
from supabase import create_client, Client

# ================= CONFIGURAZIONE =================
# Carichiamo le chiavi dal file .env.local per sicurezza
load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "https://jnhpabgohnfdiqvjzjku.supabase.co"
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # Usa la tua key service_role

CARTELLA_ARCHIVIO = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_Fatto"
# ==================================================

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode())

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    safe_print(f"[ERR] Errore connessione Supabase: {e}")
    exit()

def pulisci_namespace(xml_content):
    xml_content = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
    xml_content = re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)
    return xml_content

def estrai_ddt_da_descrizione(descrizione):
    if not descrizione: return None
    match = re.search(r'(?:DDT|Doc|Bolla|Rif)\.?\s*(?:n\.?|nr\.?)?\s*0*(\d+)', descrizione, re.IGNORECASE)
    if match: return match.group(1)
    return None

def calcola_data_scadenza(data_emissione_str, condizioni):
    """Calcola la scadenza basata su stringhe tipo '30gg DFFM' o '60gg'"""
    try:
        data_base = datetime.strptime(data_emissione_str, "%Y-%m-%d")
        giorni = 30
        if condizioni:
            match = re.search(r'(\d+)', condizioni)
            if match: giorni = int(match.group(1))
        
        scadenza = data_base + timedelta(days=giorni)
        
        if condizioni and "DFFM" in condizioni.upper():
            ultimo_giorno = calendar.monthrange(scadenza.year, scadenza.month)[1]
            scadenza = scadenza.replace(day=ultimo_giorno)
            
        return scadenza.strftime("%Y-%m-%d")
    except:
        return (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")

def _crea_scadenze_da_xml(percorso_file, fattura_id, soggetto_id, numero_fattura, data_fattura, importo_totale, condizioni_pag):
    """Crea scadenze_pagamento leggendo i dettagli pagamento dall'XML.
    Ritorna il numero di scadenze create."""
    try:
        with open(percorso_file, 'r', encoding='utf-8', errors='ignore') as f:
            xml_raw = f.read()
        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)
        body = root.find(".//FatturaElettronicaBody")
        if body is None:
            return 0
    except Exception as e:
        safe_print(f"   [ERR] Errore lettura XML per scadenze: {e}")
        return 0

    # Recupera ragione_sociale per la descrizione
    try:
        header = root.find(".//FatturaElettronicaHeader")
        anag = header.find(".//CedentePrestatore/DatiAnagrafici")
        ragione_sociale = anag.find(".//Denominazione").text if anag.find(".//Denominazione") is not None else None
        if not ragione_sociale:
            n = anag.find(".//Nome").text if anag.find(".//Nome") is not None else ""
            c = anag.find(".//Cognome").text if anag.find(".//Cognome") is not None else ""
            ragione_sociale = f"{c} {n}".strip() or "Sconosciuto"
    except:
        ragione_sociale = "Sconosciuto"

    rate_xml = body.findall(".//DettaglioPagamento")
    modalita_pag_xml = body.findall(".//DettaglioPagamento/ModalitaPagamento")
    is_domiciliazione = any(mp.text in ('MP19', 'MP20') for mp in modalita_pag_xml if mp.text)
    scadenze_create = 0

    if rate_xml:
        for i, rata in enumerate(rate_xml):
            importo_rata = float(rata.findtext('ImportoPagamento', '0'))
            data_scad_rata = rata.findtext('DataScadenzaPagamento')
            modalita_rata = rata.findtext('ModalitaPagamento', '')
            is_domiciliazione_rata = modalita_rata in ('MP19', 'MP20') or is_domiciliazione
            if not data_scad_rata:
                data_scad_rata = calcola_data_scadenza(data_fattura, condizioni_pag)
            scadenza_data = {
                "tipo": "uscita",
                "soggetto_id": soggetto_id,
                "fattura_riferimento": numero_fattura,
                "importo_totale": importo_rata,
                "importo_pagato": 0,
                "data_emissione": data_fattura,
                "data_scadenza": data_scad_rata,
                "data_pianificata": data_scad_rata,
                "stato": "da_pagare",
                "descrizione": f"Fattura n. {numero_fattura} da {ragione_sociale} (Rata {i+1}/{len(rate_xml)})",
                "fonte": "fattura",
            }
            if is_domiciliazione_rata:
                scadenza_data["auto_domiciliazione"] = True
            supabase.table("scadenze_pagamento").insert(scadenza_data).execute()
            scadenze_create += 1
            dom_label = " [SDD]" if is_domiciliazione_rata else ""
            safe_print(f"   Rata {i+1}/{len(rate_xml)}: EUR {importo_rata} scade {data_scad_rata}{dom_label}")
    else:
        data_scad = calcola_data_scadenza(data_fattura, condizioni_pag)
        scadenza_data = {
            "tipo": "uscita",
            "soggetto_id": soggetto_id,
            "fattura_riferimento": numero_fattura,
            "importo_totale": importo_totale,
            "importo_pagato": 0,
            "data_emissione": data_fattura,
            "data_scadenza": data_scad,
            "data_pianificata": data_scad,
            "stato": "da_pagare",
            "descrizione": f"Fattura n. {numero_fattura} da {ragione_sociale}",
            "fonte": "fattura",
        }
        if is_domiciliazione:
            scadenza_data["auto_domiciliazione"] = True
        supabase.table("scadenze_pagamento").insert(scadenza_data).execute()
        scadenze_create += 1
        dom_label = " [SDD]" if is_domiciliazione else ""
        safe_print(f"   Scadenziario: Scadenza {data_scad} generata.{dom_label}")

    return scadenze_create


# Contatori globali per output JSON
_stats = {"nuove": 0, "scadenze_create": 0, "scadenze_recuperate": 0, "skipped": 0, "errori": 0}


def parse_and_upload(percorso_file):
    nome_file = os.path.basename(percorso_file)

    # --- CHECK FATTURA ESISTENTE (FIX: non skip se mancano scadenze) ---
    fattura_esistente = None
    try:
        res = supabase.table("fatture_fornitori").select(
            "id, soggetto_id, numero_fattura, data_fattura, importo_totale"
        ).eq("nome_file_xml", nome_file).execute()
        if res.data and len(res.data) > 0:
            fattura_esistente = res.data[0]
    except: pass

    if fattura_esistente:
        # Fattura esiste: verifica se le scadenze sono presenti
        sogg_id = fattura_esistente.get("soggetto_id")
        num_fatt = fattura_esistente.get("numero_fattura")
        data_fatt = fattura_esistente.get("data_fattura")
        try:
            sc_res = supabase.table("scadenze_pagamento").select("id").eq(
                "soggetto_id", sogg_id
            ).eq("fattura_riferimento", num_fatt).eq("data_emissione", data_fatt).execute()
            if sc_res.data and len(sc_res.data) > 0:
                _stats["skipped"] += 1
                return  # Fattura E scadenze esistono: skip completo
        except: pass

        # Fattura esiste MA scadenze mancanti: recupera
        safe_print(f"[FIX] Scadenze mancanti per fattura esistente: {nome_file}")
        try:
            # Recupera condizioni_pagamento dal soggetto
            cond_res = supabase.table("anagrafica_soggetti").select("condizioni_pagamento").eq("id", sogg_id).execute()
            condizioni_pag = cond_res.data[0].get('condizioni_pagamento', '30gg DFFM') if cond_res.data else '30gg DFFM'
        except:
            condizioni_pag = '30gg DFFM'

        n = _crea_scadenze_da_xml(
            percorso_file,
            fattura_esistente["id"], sogg_id, num_fatt, data_fatt,
            fattura_esistente.get("importo_totale", 0), condizioni_pag
        )
        _stats["scadenze_recuperate"] += n
        return

    safe_print(f"[NEW] Nuova fattura: {nome_file}")

    try:
        with open(percorso_file, 'r', encoding='utf-8', errors='ignore') as f:
            xml_raw = f.read()
        
        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)

        header = root.find(".//FatturaElettronicaHeader")
        body = root.find(".//FatturaElettronicaBody")
        if header is None or body is None: return

        # --- ESTRAZIONE DATI FORNITORE ---
        cedente = header.find(".//CedentePrestatore")
        anag = cedente.find(".//DatiAnagrafici")
        
        # Gestione Denominazione vs Nome+Cognome (Professionisti)
        ragione_sociale = anag.find(".//Denominazione").text if anag.find(".//Denominazione") is not None else None
        if not ragione_sociale:
            n = anag.find(".//Nome").text if anag.find(".//Nome") is not None else ""
            c = anag.find(".//Cognome").text if anag.find(".//Cognome") is not None else ""
            ragione_sociale = f"{c} {n}".strip() or "Sconosciuto"

        id_fiscale = anag.find(".//IdFiscaleIVA/IdCodice")
        piva = id_fiscale.text if id_fiscale is not None else "00000000000"

        # --- UPSERT ANAGRAFICA ---
        # Recuperiamo anche condizioni_pagamento per lo scadenziario
        res_anag = supabase.table("anagrafica_soggetti").upsert({
            "partita_iva": piva,
            "ragione_sociale": ragione_sociale,
            "tipo": "fornitore"
        }, on_conflict="partita_iva").execute()
        
        soggetto_id = res_anag.data[0]['id']
        condizioni_pag = res_anag.data[0].get('condizioni_pagamento', '30gg DFFM')

        # --- DATI GENERALI FATTURA ---
        dati_gen = body.find(".//DatiGeneraliDocumento")
        numero_fattura = dati_gen.find("Numero").text
        data_fattura = dati_gen.find("Data").text
        importo_tag = dati_gen.find("ImportoTotaleDocumento")
        importo_totale = float(importo_tag.text) if importo_tag is not None else 0.0

        # --- INSERT TESTATA FATTURA ---
        res_insert = supabase.table("fatture_fornitori").insert({
            "ragione_sociale": ragione_sociale,
            "piva_fornitore": piva,
            "numero_fattura": numero_fattura,
            "data_fattura": data_fattura,
            "importo_totale": importo_totale,
            "soggetto_id": soggetto_id,
            "nome_file_xml": nome_file
        }).execute()
        
        if not res_insert.data: return
        fattura_id = res_insert.data[0]['id']
        _stats["nuove"] += 1

        # --- AUTO-GENERAZIONE SCADENZE (delega a funzione riutilizzabile) ---
        n = _crea_scadenze_da_xml(percorso_file, fattura_id, soggetto_id, numero_fattura, data_fattura, importo_totale, condizioni_pag)
        _stats["scadenze_create"] += n

        # --- LOGICA DDT (Mantenuta integra) ---
        ddt_line_map = {}
        ddt_globali = []
        dati_ddt_list = body.findall(".//DatiDDT")
        for ddt_block in dati_ddt_list:
            num_ddt_tag = ddt_block.find("NumeroDDT")
            if num_ddt_tag is not None:
                valore_ddt = num_ddt_tag.text
                rifs = ddt_block.findall("RiferimentoNumeroLinea")
                if not rifs: ddt_globali.append(valore_ddt)
                else:
                    for r in rifs: ddt_line_map[r.text] = valore_ddt
        
        stringa_ddt_globali = ",".join(ddt_globali) if ddt_globali else None

        # --- DETTAGLIO RIGHE (Mantenuto integro) ---
        righe_da_caricare = []
        dettaglio_linee = body.findall(".//DettaglioLinee")
        for linea in dettaglio_linee:
            try:
                num_linea = linea.find("NumeroLinea").text
                desc = linea.find("Descrizione").text or ""
                qty = float(linea.find("Quantita").text) if linea.find("Quantita") is not None else 0.0
                prezzo = float(linea.find("PrezzoTotale").text) if linea.find("PrezzoTotale") is not None else 0.0
                um = linea.find("UnitaMisura").text if linea.find("UnitaMisura") is not None else ""

                ddt_assegnato = ddt_line_map.get(num_linea) or stringa_ddt_globali or estrai_ddt_da_descrizione(desc)

                righe_da_caricare.append({
                    "fattura_id": fattura_id,
                    "numero_linea": int(num_linea) if num_linea.isdigit() else 0,
                    "descrizione": desc,
                    "quantita": qty,
                    "unita_misura": um,
                    "prezzo_totale": prezzo,
                    "ddt_riferimento": ddt_assegnato
                })
            except: continue

        if righe_da_caricare:
            supabase.table("fatture_dettaglio_righe").insert(righe_da_caricare).execute()
            safe_print(f"   [OK] Caricate {len(righe_da_caricare)} righe dettaglio.")

    except Exception as e:
        _stats["errori"] += 1
        safe_print(f"   [ERR] Errore su {nome_file}: {e}")

def run():
    safe_print(f"AVVIO IMPORTAZIONE E SCADENZIARIO DA: {CARTELLA_ARCHIVIO}")
    if not os.path.exists(CARTELLA_ARCHIVIO):
        safe_print(f"[ERR] Cartella non trovata: {CARTELLA_ARCHIVIO}")
        if "--json" in sys.argv:
            print(f"###JSON_RESULT###{json.dumps({'errore': 'cartella_non_trovata', **_stats})}")
        return
    files = [f for f in os.listdir(CARTELLA_ARCHIVIO) if f.lower().endswith('.xml')]
    for f in files:
        parse_and_upload(os.path.join(CARTELLA_ARCHIVIO, f))
    safe_print(f"ELABORAZIONE COMPLETATA.")
    safe_print(f"   Nuove fatture: {_stats['nuove']}, Scadenze create: {_stats['scadenze_create']}, "
          f"Scadenze recuperate: {_stats['scadenze_recuperate']}, Skip: {_stats['skipped']}, Errori: {_stats['errori']}")

    if "--json" in sys.argv:
        print(f"###JSON_RESULT###{json.dumps(_stats)}")

if __name__ == "__main__":
    run()