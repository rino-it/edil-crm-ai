"""
Script una-tantum: ripara ddt_riferimento concatenati in fatture_dettaglio_righe.

Problema: quando l'XML ha DatiDDT senza RiferimentoNumeroLinea, lo script di import
assegnava la stringa concatenata "13176,13535,13713" a tutte le righe. Questo impedisce
il raggruppamento per DDT singolo nel modale di assegnazione cantiere.

Soluzione: rileggere gli XML originali, trovare le righe-header con DDT nel nome
(es. "DOT 13176 del 01-12-2025" con prezzo=0), e assegnare il DDT singolo
alle righe successive.

Uso:
  python scripts/fix_ddt_concatenati.py [--dry-run]
"""

import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime

try:
    from supabase import create_client
except ImportError:
    print("supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_script_dir, "..")
load_dotenv(os.path.join(_project_root, ".env.local"))
load_dotenv(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Variabili d'ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
DRY_RUN = "--dry-run" in sys.argv

# Percorso XML su NAS
_base = Path(r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025")
_contab = next((d for d in _base.iterdir() if d.name.lower().startswith("contabilit")), None)
if not _contab:
    print(f"Cartella contabilita non trovata sotto {_base}")
    sys.exit(1)
XML_SOURCE = _contab / "Archivio_Fatto"


def pulisci_namespace(xml_content):
    return re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)


def estrai_ddt_da_descrizione(descrizione):
    if not descrizione:
        return None
    match = re.search(r'(?:DDT|DOT|Doc|Bolla|Rif)\.?\s*(?:n\.?|nr\.?|n\s)?\s*0*(\d+)', descrizione, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def analizza_xml_per_ddt(xml_path):
    """
    Legge un XML FatturaPA e ritorna un dict {numero_linea: ddt_singolo}
    usando la logica header-descrizione (righe con prezzo 0 che contengono DDT).
    """
    try:
        with open(str(xml_path), 'r', encoding='utf-8', errors='ignore') as f:
            xml_raw = f.read()
        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)
        body = root.find(".//FatturaElettronicaBody")
        if body is None:
            return None, None

        # Estrai numero fattura
        gen = body.find(".//DatiGeneraliDocumento")
        if gen is None:
            return None, None
        numero_fattura = gen.findtext("Numero", "").strip()

        # Verifica se DDT sono globali
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

        # Se i DDT hanno gia' RiferimentoNumeroLinea, skip
        if ddt_line_map:
            return numero_fattura, None

        # Se non ci sono DDT globali, skip
        if not ddt_globali:
            return numero_fattura, None

        # Analizza le descrizioni per trovare header DDT
        dettaglio_linee = body.findall(".//DettaglioLinee")
        result = {}
        current_ddt = None

        for linea in dettaglio_linee:
            num_linea_tag = linea.find("NumeroLinea")
            desc_tag = linea.find("Descrizione")
            prezzo_tag = linea.find("PrezzoTotale")

            if num_linea_tag is None:
                continue

            num_linea = int(num_linea_tag.text) if num_linea_tag.text.isdigit() else 0
            desc = desc_tag.text if desc_tag is not None else ""
            prezzo = float(prezzo_tag.text) if prezzo_tag is not None else 0.0

            header_ddt = estrai_ddt_da_descrizione(desc)
            if header_ddt and prezzo == 0.0:
                current_ddt = header_ddt
                result[num_linea] = current_ddt
            elif current_ddt:
                result[num_linea] = current_ddt

        # Valida: serve piu' di un DDT distinto per essere utile
        ddt_unici = set(result.values())
        if len(ddt_unici) > 1:
            return numero_fattura, result

        return numero_fattura, None

    except Exception as e:
        print(f"  Errore parsing {xml_path.name}: {e}")
        return None, None


def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] Fix DDT concatenati in fatture_dettaglio_righe")
    if DRY_RUN:
        print("  MODO DRY-RUN: nessuna scrittura su DB")

    # 1. Trova righe con DDT concatenati (contengono virgola)
    righe_concat = []
    offset = 0
    while True:
        batch = supabase.table("fatture_dettaglio_righe") \
            .select("id, fattura_id, numero_linea, ddt_riferimento") \
            .like("ddt_riferimento", "%,%") \
            .range(offset, offset + 999) \
            .execute()
        righe_concat.extend(batch.data or [])
        if not batch.data or len(batch.data) < 1000:
            break
        offset += 1000

    print(f"  Righe con DDT concatenati: {len(righe_concat)}")
    if not righe_concat:
        print("  Nessuna riga da riparare.")
        return

    # 2. Raggruppa per fattura_id
    fatture_ids = set(r["fattura_id"] for r in righe_concat)
    print(f"  Fatture coinvolte: {len(fatture_ids)}")

    # 3. Carica le fatture per trovare gli XML corrispondenti
    fatture_info = {}
    for fid in fatture_ids:
        res = supabase.table("fatture_fornitori") \
            .select("id, numero_fattura, nome_file_xml") \
            .eq("id", fid) \
            .single() \
            .execute()
        if res.data:
            fatture_info[fid] = res.data

    print(f"  Fatture trovate in DB: {len(fatture_info)}")

    # 4. Per ogni fattura, cerca l'XML originale e ricalcola DDT
    stats = {"riparate": 0, "xml_non_trovato": 0, "no_header": 0, "errori": 0}

    for fid, finfo in fatture_info.items():
        nome_xml = finfo.get("nome_file_xml")
        xml_path = None

        if nome_xml:
            candidate = XML_SOURCE / nome_xml
            if candidate.exists():
                xml_path = candidate

        if not xml_path:
            # Cerca per pattern nel nome
            numero = finfo.get("numero_fattura", "")
            for xml_file in XML_SOURCE.glob("*.xml"):
                if numero.replace("/", "") in xml_file.name.replace("/", ""):
                    xml_path = xml_file
                    break

        if not xml_path:
            stats["xml_non_trovato"] += 1
            continue

        numero_fattura, ddt_map = analizza_xml_per_ddt(xml_path)
        if not ddt_map:
            stats["no_header"] += 1
            continue

        # 5. Aggiorna le righe con il DDT singolo
        righe_fattura = [r for r in righe_concat if r["fattura_id"] == fid]
        aggiornate = 0
        for riga in righe_fattura:
            nuovo_ddt = ddt_map.get(riga["numero_linea"])
            if nuovo_ddt and nuovo_ddt != riga["ddt_riferimento"]:
                aggiornate += 1
                if not DRY_RUN:
                    supabase.table("fatture_dettaglio_righe") \
                        .update({"ddt_riferimento": nuovo_ddt}) \
                        .eq("id", riga["id"]) \
                        .execute()

        if aggiornate > 0:
            stats["riparate"] += 1
            ddt_unici = len(set(ddt_map.values()))
            print(f"  [FIX] Fatt. {numero_fattura}: {aggiornate} righe aggiornate ({ddt_unici} DDT distinti)")

    print(f"\n  Risultato:")
    print(f"    Fatture riparate:      {stats['riparate']}")
    print(f"    XML non trovato:       {stats['xml_non_trovato']}")
    print(f"    No header DDT in XML:  {stats['no_header']}")
    print(f"    Errori:                {stats['errori']}")
    if DRY_RUN:
        print(f"    (dry-run, nessun UPDATE eseguito)")


if __name__ == "__main__":
    main()
