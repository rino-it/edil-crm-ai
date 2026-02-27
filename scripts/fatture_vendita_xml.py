import os
import sys
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

def main():
    try:
        print("Inizializzazione script...")
        
        # 1. Trova il file .env in modo dinamico
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env_path = os.path.join(base_dir, '.env.local')
        if not os.path.exists(env_path):
            env_path = os.path.join(base_dir, '.env')
            
        print(f"Cerco file variabili d'ambiente in: {env_path}")
        load_dotenv(env_path)

        SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError(f"❌ CHIAVI MANCANTI. SUPABASE_URL: {'Trovato' if SUPABASE_URL else 'Mancante'}, SUPABASE_KEY: {'Trovato' if SUPABASE_KEY else 'Mancante'}")

        print("Connessione a Supabase in corso...")
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

        # ==========================================
        # FUNZIONE DI NORMALIZZAZIONE P.IVA E C.F.
        # ==========================================
        def pulisci_piva_cf(valore):
            if not valore: 
                return None
            v = valore.strip().upper()
            # Rimuove prefisso IT se presente
            if v.startswith('IT'):
                v = v[2:]
            
            # Se è composto interamente da numeri (P.IVA o CF numerico)
            if v.isdigit():
                # Rimuove eventuali zeri iniziali sporchi per avere la base numerica pura
                v = v.lstrip('0')
                # Aggiunge gli zeri in testa per forzare rigorosamente le 11 cifre italiane standard
                v = v.zfill(11)
            return v

        def strip_namespaces(xml_string):
            import re
            return re.sub(' xmlns="[^"]+"', '', xml_string, count=1)

        def parse_e_importa_fattura(file_path):
            print(f"\n📄 Elaborazione: {os.path.basename(file_path)}")
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                xml_content = f.read()
            
            clean_xml = strip_namespaces(xml_content)
            root = ET.fromstring(clean_xml)

            cessionario = root.find('.//CessionarioCommittente/DatiAnagrafici')
            if cessionario is None:
                print("❌ Cessionario non trovato. Saltata.")
                return

            # Estrazione e normalizzazione PIVA e CF
            piva_grezza = cessionario.findtext('.//IdFiscaleIVA/IdCodice')
            piva_cliente = pulisci_piva_cf(piva_grezza)

            cf_grezzo = cessionario.findtext('.//CodiceFiscale')
            codice_fiscale = pulisci_piva_cf(cf_grezzo)
            
            anagrafica = cessionario.find('.//Anagrafica')
            ragione_sociale = anagrafica.findtext('Denominazione')
            if not ragione_sociale:
                nome = anagrafica.findtext('Nome', '')
                cognome = anagrafica.findtext('Cognome', '')
                ragione_sociale = f"{nome} {cognome}".strip()

            # Ricerca soggetto rigorosa
            soggetto_data = []
            if piva_cliente:
                res = supabase.table('anagrafica_soggetti').select('id').eq('partita_iva', piva_cliente).execute()
                soggetto_data = res.data
            elif codice_fiscale:
                res = supabase.table('anagrafica_soggetti').select('id').eq('codice_fiscale', codice_fiscale).execute()
                soggetto_data = res.data
            else:
                res = supabase.table('anagrafica_soggetti').select('id').eq('ragione_sociale', ragione_sociale).execute()
                soggetto_data = res.data
            
            if len(soggetto_data) > 0:
                soggetto_id = soggetto_data[0]['id']
                print(f"✅ Soggetto trovato: {ragione_sociale} (ID Normalizzato)")
            else:
                nuovo_soggetto = {
                    "ragione_sociale": ragione_sociale,
                    "partita_iva": piva_cliente,
                    "codice_fiscale": codice_fiscale,
                    "tipo": "cliente"
                }
                res = supabase.table('anagrafica_soggetti').insert(nuovo_soggetto).execute()
                soggetto_id = res.data[0]['id']
                print(f"🌟 Nuovo soggetto creato: {ragione_sociale}")

            dati_generali = root.find('.//DatiGeneraliDocumento')
            numero_fattura = dati_generali.findtext('Numero')
            data_fattura = dati_generali.findtext('Data')
            importo_totale = float(dati_generali.findtext('ImportoTotaleDocumento', '0'))
            
            dati_ddt = root.find('.//DatiDDT')
            numero_ddt = dati_ddt.findtext('NumeroDDT') if dati_ddt is not None else None

            check_fattura = supabase.table('fatture_vendita').select('id').eq('numero_fattura', numero_fattura).eq('soggetto_id', soggetto_id).execute()
            if len(check_fattura.data) > 0:
                print(f"⚠️ Fattura {numero_fattura} già importata. Ignoro.")
                return

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
                    "ddt_riferimento": numero_ddt
                })
            
            if righe_da_inserire:
                supabase.table('fatture_vendita_righe').insert(righe_da_inserire).execute()

            # 6. AUTO-GENERAZIONE SCADENZE CON SUPPORTO MULTI-RATA
            rate_xml = root.findall('.//DettaglioPagamento')
            scadenza_id = None

            if rate_xml:
                for i, rata in enumerate(rate_xml):
                    importo_rata = float(rata.findtext('ImportoPagamento', '0'))
                    data_scadenza = rata.findtext('DataScadenzaPagamento')

                    if not data_scadenza:
                        dt_fattura = datetime.strptime(data_fattura, "%Y-%m-%d")
                        data_scadenza = (dt_fattura + timedelta(days=30)).strftime("%Y-%m-%d")

                    check_scadenza_rata = supabase.table('scadenze_pagamento') \
                        .select('id') \
                        .eq('fattura_riferimento', numero_fattura) \
                        .eq('soggetto_id', soggetto_id) \
                        .eq('data_scadenza', data_scadenza) \
                        .eq('importo_totale', importo_rata) \
                        .eq('tipo', 'entrata') \
                        .execute()

                    if len(check_scadenza_rata.data) > 0:
                        scadenza_rata_id = check_scadenza_rata.data[0]['id']
                        supabase.table('scadenze_pagamento').update({"fattura_vendita_id": fattura_id}).eq('id', scadenza_rata_id).execute()
                    else:
                        nuova_scadenza = {
                            "soggetto_id": soggetto_id,
                            "fattura_vendita_id": fattura_id,
                            "fattura_riferimento": numero_fattura,
                            "importo_totale": importo_rata,
                            "importo_pagato": 0,
                            "data_emissione": data_fattura,
                            "data_scadenza": data_scadenza,
                            "data_pianificata": data_scadenza,
                            "tipo": "entrata",
                            "stato": "da_pagare",
                            "descrizione": f"Fattura di Vendita n. {numero_fattura} (Rata {i+1}/{len(rate_xml)})"
                        }
                        res_scadenza = supabase.table('scadenze_pagamento').insert(nuova_scadenza).execute()
                        scadenza_rata_id = res_scadenza.data[0]['id']

                    if scadenza_id is None:
                        scadenza_id = scadenza_rata_id
            else:
                dt_fattura = datetime.strptime(data_fattura, "%Y-%m-%d")
                data_scadenza = (dt_fattura + timedelta(days=30)).strftime("%Y-%m-%d")

                check_scadenza = supabase.table('scadenze_pagamento').select('id').eq('fattura_riferimento', numero_fattura).eq('soggetto_id', soggetto_id).execute()

                if len(check_scadenza.data) > 0:
                    print(f"⚠️ Scadenza già presente per fattura {numero_fattura}. La ricollego alla fattura.")
                    scadenza_id = check_scadenza.data[0]['id']
                    supabase.table('scadenze_pagamento').update({"fattura_vendita_id": fattura_id}).eq('id', scadenza_id).execute()
                else:
                    nuova_scadenza = {
                        "soggetto_id": soggetto_id,
                        "fattura_vendita_id": fattura_id,
                        "fattura_riferimento": numero_fattura,
                        "importo_totale": importo_totale,
                        "importo_pagato": 0,
                        "data_emissione": data_fattura,
                        "data_scadenza": data_scadenza,
                        "data_pianificata": data_scadenza,
                        "tipo": "entrata",
                        "stato": "da_pagare",
                        "descrizione": f"Fattura di Vendita n. {numero_fattura}"
                    }
                    res_scadenza = supabase.table('scadenze_pagamento').insert(nuova_scadenza).execute()
                    scadenza_id = res_scadenza.data[0]['id']

            supabase.table('fatture_vendita').update({"scadenza_id": scadenza_id}).eq('id', fattura_id).execute()

            print(f"✅ Inserita Fattura {numero_fattura} (€{importo_totale}) e collegata Scadenza (Entrata).")

        # Cartella di ricerca
        cartella = r"C:\Users\Ufficio\Desktop\PROGETTO X\Sviluppo\fatture di vendita"
        if not os.path.exists(cartella):
            print(f"\n❌ ERRORE: Cartella {cartella} non trovata.")
        else:
            file_xml = [f for f in os.listdir(cartella) if f.lower().endswith('.xml')]
            print(f"\nTrovati {len(file_xml)} file XML da elaborare nella cartella: {cartella}")
            
            for f in file_xml:
                parse_e_importa_fattura(os.path.join(cartella, f))

        print("\n🎉 IMPORTAZIONE COMPLETATA CON SUCCESSO!")

    except Exception as e:
        print("\n" + "="*50)
        print("❌ ERRORE CRITICO DURANTE L'ESECUZIONE DELLO SCRIPT ❌")
        print("="*50)
        traceback.print_exc()
        print("="*50)

if __name__ == "__main__":
    main()
    input("\nPremi INVIO per chiudere questa finestra...")