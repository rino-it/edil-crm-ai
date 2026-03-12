"""
Importa SOLO i DDT dagli XML di archivio_xml_2024.

Garanzie:
  - NON crea scadenze_pagamento
  - NON modifica importi su nessuna tabella
  - Crea fatture_fornitori SOLO come contenitore per righe DDT
  - Crea fatture_dettaglio_righe con ddt_riferimento
  - Aggiorna SOLO il campo fattura_fornitore_id sulle scadenze esistenti (link FK)

Flusso:
  1. Legge ogni XML da archivio_xml_2024
  2. Estrae DDT (DatiDDT + header-descrizione)
  3. Cerca scadenza esistente per soggetto + numero_fattura + data
  4. Se trovata: crea fatture_fornitori + righe + collega FK
  5. Se non trovata: skip
"""
import os
import re
import sys
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CARTELLA_2024 = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\archivio_xml_2024"

DRY_RUN = "--execute" not in sys.argv

stats = {
    "processati": 0, "con_ddt": 0, "con_scadenza": 0,
    "fatture_create": 0, "righe_create": 0, "link_fk": 0,
    "skip_no_ddt": 0, "skip_no_soggetto": 0, "skip_no_scadenza": 0,
    "skip_esistente": 0, "errori": 0,
}


def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode())


def pulisci_namespace(xml_content):
    xml_content = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
    xml_content = re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)
    return xml_content


def estrai_ddt_da_descrizione(descrizione):
    if not descrizione:
        return None
    match = re.search(r'(?:DDT|DOT|Doc|Bolla|Rif)\.?\s*(?:n\.?|nr\.?|n\s)?\s*0*(\d+)', descrizione, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def assegna_ddt_da_header_descrizioni(dettaglio_linee, ddt_globali):
    ddt_per_linea = {}
    current_ddt = None
    for linea in dettaglio_linee:
        num_linea_tag = linea.find("NumeroLinea")
        desc_tag = linea.find("Descrizione")
        prezzo_tag = linea.find("PrezzoTotale")
        if num_linea_tag is None:
            continue
        num_linea = num_linea_tag.text
        desc = desc_tag.text if desc_tag is not None else ""
        prezzo = float(prezzo_tag.text) if prezzo_tag is not None else 0.0
        header_ddt = estrai_ddt_da_descrizione(desc)
        if header_ddt and prezzo == 0.0:
            current_ddt = header_ddt
            ddt_per_linea[num_linea] = current_ddt
        elif current_ddt:
            ddt_per_linea[num_linea] = current_ddt
    if len(ddt_per_linea) > 0:
        ddt_unici = set(ddt_per_linea.values())
        if len(ddt_unici) > 1:
            return ddt_per_linea
    return {}


def processa_xml(percorso_file):
    nome_file = os.path.basename(percorso_file)
    stats["processati"] += 1

    try:
        with open(percorso_file, "r", encoding="utf-8", errors="ignore") as f:
            xml_raw = f.read()

        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)

        header = root.find(".//FatturaElettronicaHeader")
        body = root.find(".//FatturaElettronicaBody")
        if header is None or body is None:
            return

        cedente = header.find(".//CedentePrestatore")
        anag_xml = cedente.find(".//DatiAnagrafici")

        ragione_sociale = anag_xml.find(".//Denominazione").text if anag_xml.find(".//Denominazione") is not None else None
        if not ragione_sociale:
            n = anag_xml.find(".//Nome").text if anag_xml.find(".//Nome") is not None else ""
            c = anag_xml.find(".//Cognome").text if anag_xml.find(".//Cognome") is not None else ""
            ragione_sociale = f"{c} {n}".strip() or "Sconosciuto"

        id_fiscale = anag_xml.find(".//IdFiscaleIVA/IdCodice")
        piva = id_fiscale.text if id_fiscale is not None else None

        dati_gen = body.find(".//DatiGeneraliDocumento")
        numero_fattura = dati_gen.find("Numero").text
        data_fattura = dati_gen.find("Data").text
        importo_tag = dati_gen.find("ImportoTotaleDocumento")
        importo_totale = float(importo_tag.text) if importo_tag is not None else 0.0

        # --- ESTRAI DDT ---
        ddt_line_map = {}
        ddt_globali = []
        for ddt_block in body.findall(".//DatiDDT"):
            num_ddt_tag = ddt_block.find("NumeroDDT")
            if num_ddt_tag is not None:
                valore_ddt = num_ddt_tag.text
                rifs = ddt_block.findall("RiferimentoNumeroLinea")
                if not rifs:
                    ddt_globali.append(valore_ddt)
                else:
                    for r in rifs:
                        ddt_line_map[r.text] = valore_ddt

        stringa_ddt_globali = ",".join(ddt_globali) if ddt_globali else None

        dettaglio_linee = body.findall(".//DettaglioLinee")
        ddt_header_map = {}
        if ddt_globali and not ddt_line_map:
            ddt_header_map = assegna_ddt_da_header_descrizioni(dettaglio_linee, ddt_globali)

        # Costruisci righe
        righe = []
        ha_ddt = False
        for linea in dettaglio_linee:
            try:
                num_linea = linea.find("NumeroLinea").text
                desc = linea.find("Descrizione").text or ""
                qty = float(linea.find("Quantita").text) if linea.find("Quantita") is not None else 0.0
                prezzo = float(linea.find("PrezzoTotale").text) if linea.find("PrezzoTotale") is not None else 0.0
                um = linea.find("UnitaMisura").text if linea.find("UnitaMisura") is not None else ""

                ddt = ddt_line_map.get(num_linea) or ddt_header_map.get(num_linea) or stringa_ddt_globali or estrai_ddt_da_descrizione(desc)
                if ddt:
                    ha_ddt = True

                righe.append({
                    "numero_linea": int(num_linea) if num_linea.isdigit() else 0,
                    "descrizione": desc,
                    "quantita": qty,
                    "unita_misura": um,
                    "prezzo_totale": prezzo,
                    "ddt_riferimento": ddt,
                })
            except:
                continue

        if not ha_ddt:
            stats["skip_no_ddt"] += 1
            return

        stats["con_ddt"] += 1

        # --- TROVA SOGGETTO ---
        soggetto_id = None
        if piva:
            res_anag = supabase.table("anagrafica_soggetti").select("id").eq("partita_iva", piva).execute()
            if res_anag.data:
                soggetto_id = res_anag.data[0]["id"]

        if not soggetto_id:
            stats["skip_no_soggetto"] += 1
            return

        # --- CERCA SCADENZE ESISTENTI (non ne crea di nuove) ---
        scad_res = supabase.table("scadenze_pagamento").select("id,fattura_fornitore_id").eq(
            "soggetto_id", soggetto_id
        ).eq("fattura_riferimento", numero_fattura).eq("data_emissione", data_fattura).execute()

        scadenze_match = scad_res.data or []
        if not scadenze_match:
            stats["skip_no_scadenza"] += 1
            return

        stats["con_scadenza"] += 1

        # --- SKIP SE GIA' IMPORTATO ---
        check = supabase.table("fatture_fornitori").select("id").eq("nome_file_xml", nome_file).execute()
        if check.data:
            stats["skip_esistente"] += 1
            return

        ddt_unici = sorted(set(r["ddt_riferimento"] for r in righe if r["ddt_riferimento"]))
        safe_print(f"  {ragione_sociale} - Fatt. {numero_fattura} del {data_fattura} -> {len(ddt_unici)} DDT: {', '.join(ddt_unici[:5])}{'...' if len(ddt_unici) > 5 else ''}")

        if DRY_RUN:
            stats["fatture_create"] += 1
            stats["righe_create"] += len(righe)
            stats["link_fk"] += sum(1 for s in scadenze_match if not s.get("fattura_fornitore_id"))
            return

        # --- CREA fatture_fornitori (contenitore DDT, zero impatto scadenziario) ---
        res_insert = supabase.table("fatture_fornitori").insert({
            "ragione_sociale": ragione_sociale,
            "piva_fornitore": piva,
            "numero_fattura": numero_fattura,
            "data_fattura": data_fattura,
            "importo_totale": importo_totale,
            "soggetto_id": soggetto_id,
            "nome_file_xml": nome_file,
        }).execute()

        if not res_insert.data:
            stats["errori"] += 1
            return

        fattura_id = res_insert.data[0]["id"]
        stats["fatture_create"] += 1

        # --- CREA righe dettaglio con DDT ---
        righe_db = [dict(r, fattura_id=fattura_id) for r in righe]
        supabase.table("fatture_dettaglio_righe").insert(righe_db).execute()
        stats["righe_create"] += len(righe_db)

        # --- COLLEGA scadenze esistenti (solo FK, nessun altro campo) ---
        for s in scadenze_match:
            if not s.get("fattura_fornitore_id"):
                supabase.table("scadenze_pagamento").update({
                    "fattura_fornitore_id": fattura_id
                }).eq("id", s["id"]).execute()
                stats["link_fk"] += 1

    except Exception as e:
        stats["errori"] += 1
        safe_print(f"  [ERR] {nome_file}: {e}")


def main():
    mode = "DRY RUN" if DRY_RUN else "ESECUZIONE"
    safe_print(f"=== IMPORT DDT DA ARCHIVIO 2024 - {mode} ===")
    safe_print(f"Solo DDT: nessuna scadenza creata, nessun importo modificato.\n")

    if not os.path.exists(CARTELLA_2024):
        safe_print(f"[ERR] Cartella non trovata: {CARTELLA_2024}")
        return

    files = sorted(f for f in os.listdir(CARTELLA_2024) if f.lower().endswith(".xml"))
    safe_print(f"File XML trovati: {len(files)}\n")

    for f in files:
        processa_xml(os.path.join(CARTELLA_2024, f))

    safe_print(f"\n{'='*60}")
    safe_print(f"  RIEPILOGO ({mode})")
    safe_print(f"{'='*60}")
    safe_print(f"  XML processati:          {stats['processati']}")
    safe_print(f"  Con DDT nell'XML:        {stats['con_ddt']}")
    safe_print(f"  Con scadenza esistente:  {stats['con_scadenza']}")
    safe_print(f"  ---")
    safe_print(f"  Fatture create (ponte):  {stats['fatture_create']}")
    safe_print(f"  Righe dettaglio (DDT):   {stats['righe_create']}")
    safe_print(f"  Scadenze collegate (FK): {stats['link_fk']}")
    safe_print(f"  ---")
    safe_print(f"  Skip (no DDT):           {stats['skip_no_ddt']}")
    safe_print(f"  Skip (no soggetto):      {stats['skip_no_soggetto']}")
    safe_print(f"  Skip (no scadenza):      {stats['skip_no_scadenza']}")
    safe_print(f"  Skip (gia' esistente):   {stats['skip_esistente']}")
    safe_print(f"  Errori:                  {stats['errori']}")
    safe_print(f"  ---")
    safe_print(f"  Scadenze create:         0 (by design)")
    safe_print(f"  Importi modificati:      0 (by design)")

    if DRY_RUN:
        safe_print(f"\n  Per eseguire: python import_ddt_da_archivio_2024.py --execute")


if __name__ == "__main__":
    main()
