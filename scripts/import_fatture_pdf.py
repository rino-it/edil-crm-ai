"""
Script: import_fatture_pdf.py
Scansiona la cartella PDF fatture di tic23, le carica su Supabase Storage
e le associa alle scadenze_pagamento tramite matching con l'XML gemello.

Logica:
  1. Per ogni PDF in Archivio_pdf, estrae il pattern _N.{xxx}_del_{dd-mm-yyyy}_
  2. Cerca l'XML gemello in Archivio_Fatto con lo stesso pattern nel nome
  3. Dall'XML gemello estrae:
     a) Il tag <Numero> → fattura_riferimento reale (con / e \ originali)
     b) La PIVA dal nome file XML → identifica il soggetto
  4. Matching a 2 livelli (sempre con data obbligatoria):
     1° Numero reale (da XML) + data esatta
     2° PIVA soggetto (da nome XML) + data esatta (indipendente da fattura_riferimento)

Requisiti:
  pip install supabase python-dotenv

Uso:
  python scripts/import_fatture_pdf.py
"""

import os
import re
import sys
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

# ─── Configurazione ────────────────────────────────────────────────
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_script_dir, "..")
load_dotenv(os.path.join(_project_root, ".env.local"))
load_dotenv(os.path.join(_project_root, ".env"))  # fallback

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET_NAME = "fatture-pdf"

# Percorsi tic23 via rete - risolvono contabilità con accento
_base = Path(r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025")
_contab = next((d for d in _base.iterdir() if d.name.lower().startswith("contabilit")), None)
if not _contab:
    print("❌ Cartella contabilità non trovata sotto", _base)
    sys.exit(1)

PDF_SOURCE_PATH = _contab / "Archivio_pdf"
XML_SOURCE_PATH = _contab / "Archivio_Fatto"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Variabili d'ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Log ────────────────────────────────────────────────────────────
LOG_FILE = os.path.join(_project_root, "import_fatture_pdf_log.txt")
log_lines = []

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode('ascii', 'replace').decode())
    log_lines.append(line)


# ─── Estrai pattern (numero_file, data) dal nome file ───────────────
def estrai_pattern_da_nome(filename: str):
    """
    Estrae (numero_nel_nome, data_ddmmyyyy) dal nome file.
    Usato per trovare l'XML gemello (che ha lo stesso pattern).
    """
    # Pattern 1: _N.{numero}_del_{dd-mm-yyyy}_
    match = re.search(r"_N\.(.+?)_del_(\d{2}-\d{2}-\d{4})_", filename)
    if match:
        return match.group(1), match.group(2)
    
    # Pattern 2: {numero}_del_{dd-mm-yyyy}_ (senza prefisso Fatt.Acq._N.)
    match = re.search(r"^(.+?)_del_(\d{2}-\d{2}-\d{4})_", filename)
    if match:
        return match.group(1), match.group(2)
    
    return None, None


# ─── Indice XML: mappa (numero_file, data) → (xml_path, piva) ───────
def estrai_piva_da_nome_xml(filename: str) -> str | None:
    """
    Estrae la PIVA dal nome XML.
    Es: "Fatt.Acq._N.2601C240477_del_01-01-2026_IT12454611000.xml" → "12454611000"
    Es: "Fatt.Acq._N.8_del_26-02-2026_IT016417907022026n_01TPx (1).xml" → "016417907022026n"
    La PIVA è il blocco dopo _del_dd-mm-yyyy_ e prima del prossimo _ o .xml
    """
    match = re.search(r"_del_\d{2}-\d{2}-\d{4}_([A-Z]{2}\d[\w]+)", filename)
    if match:
        raw = match.group(1)
        # Rimuovi prefisso paese (IT, NL, ecc.)
        if len(raw) > 2 and raw[:2].isalpha():
            return raw[2:]
    return None


def build_xml_index(xml_dir: Path) -> dict:
    """Costruisce indice {(numero_nel_nome, data_ddmmyyyy): (xml_path, piva)}"""
    index = {}
    for xml_file in xml_dir.glob("*.xml"):
        num, data = estrai_pattern_da_nome(xml_file.name)
        if num and data:
            piva = estrai_piva_da_nome_xml(xml_file.name)
            index[(num, data)] = (xml_file, piva)
    return index


# ─── Leggi <Numero> dal contenuto XML ────────────────────────────────
def leggi_numero_da_xml(xml_path: Path) -> str | None:
    """
    Legge il tag <Numero> dalla fattura elettronica XML.
    Questo è il vero numero fattura (con /, \\, ecc.) come salvato nel DB.
    """
    try:
        tree = ET.parse(str(xml_path))
        root = tree.getroot()
        for elem in root.iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag == "Numero" and elem.text:
                return elem.text.strip()
    except Exception as e:
        log(f"  ⚠️ Errore lettura XML {xml_path.name}: {e}")
    return None


# ─── Upload su Supabase Storage ─────────────────────────────────────
def upload_pdf(filepath: str, filename: str) -> str | None:
    """Upload del file su Supabase Storage. Restituisce l'URL pubblico."""
    try:
        anno = "2026"
        match = re.search(r"(\d{4})", filename)
        if match:
            anno = match.group(1)
        
        storage_path = f"{anno}/{filename}"
        
        with open(filepath, "rb") as f:
            file_bytes = f.read()
        
        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path,
            file_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"}
        )
        
        return supabase.storage.from_(BUCKET_NAME).get_public_url(storage_path)
    except Exception as e:
        log(f"  ❌ Errore upload {filename}: {e}")
        return None


# ─── Matching con scadenze_pagamento ─────────────────────────────────
def match_e_aggiorna(numero_fattura: str | None, data_emissione: str, piva: str | None, file_url: str) -> bool:
    """
    Cerca la scadenza e aggiorna file_url. Data sempre obbligatoria.
    
    Strategia (in ordine):
    1. fattura_riferimento ESATTO + data_emissione ESATTA
    2. PIVA soggetto + data_emissione ESATTA (indipendente da come fattura_riferimento è salvato)
    """
    if not data_emissione:
        return False
    
    # Strategia 1: fattura_riferimento + data
    if numero_fattura:
        result = supabase.table("scadenze_pagamento") \
            .select("id, fattura_riferimento, data_emissione") \
            .eq("fattura_riferimento", numero_fattura) \
            .eq("data_emissione", data_emissione) \
            .is_("file_url", "null") \
            .execute()
        
        if result.data and len(result.data) > 0:
            for scadenza in result.data:
                supabase.table("scadenze_pagamento") \
                    .update({"file_url": file_url}) \
                    .eq("id", scadenza["id"]) \
                    .execute()
                log(f"  ✅ Match numero+data → scadenza {scadenza['id']} (fatt: {scadenza['fattura_riferimento']})")
            return True
    
    # Strategia 2: PIVA soggetto + data
    if piva:
        # Trova soggetto_id dalla PIVA (prova esatta, poi i primi 11 caratteri)
        soggetto_id = None
        
        # Prova PIVA esatta
        r = supabase.table("anagrafica_soggetti") \
            .select("id") \
            .eq("partita_iva", piva) \
            .execute()
        if r.data:
            soggetto_id = r.data[0]["id"]
        
        # Prova primi 11 caratteri (PIVA standard italiana)
        if not soggetto_id and len(piva) > 11:
            piva_short = piva[:11]
            r = supabase.table("anagrafica_soggetti") \
                .select("id") \
                .eq("partita_iva", piva_short) \
                .execute()
            if r.data:
                soggetto_id = r.data[0]["id"]
        
        # Prova come codice_fiscale
        if not soggetto_id:
            r = supabase.table("anagrafica_soggetti") \
                .select("id") \
                .eq("codice_fiscale", piva) \
                .execute()
            if r.data:
                soggetto_id = r.data[0]["id"]
        
        if soggetto_id:
            result = supabase.table("scadenze_pagamento") \
                .select("id, fattura_riferimento, data_emissione") \
                .eq("soggetto_id", soggetto_id) \
                .eq("data_emissione", data_emissione) \
                .is_("file_url", "null") \
                .execute()
            
            if result.data and len(result.data) > 0:
                # Se c'è una sola scadenza, è quella giusta
                # Se ce ne sono multiple, prendi quella col fattura_riferimento più simile
                if len(result.data) == 1:
                    target = result.data[0]
                else:
                    # Scegli la scadenza col fattura_riferimento più simile al numero
                    def similarity(fatt_db: str) -> int:
                        if not fatt_db or not numero_fattura:
                            return 0
                        # Normalizza: rimuovi / \ spazi
                        norm_db = re.sub(r"[/\\\s]", "", fatt_db).upper()
                        norm_xml = re.sub(r"[/\\\s]", "", numero_fattura).upper()
                        if norm_db == norm_xml:
                            return 1000
                        # Prefisso comune
                        common = 0
                        for a, b in zip(norm_db, norm_xml):
                            if a == b:
                                common += 1
                            else:
                                break
                        return common
                    
                    target = max(result.data, key=lambda s: similarity(s.get("fattura_riferimento", "")))
                
                supabase.table("scadenze_pagamento") \
                    .update({"file_url": file_url}) \
                    .eq("id", target["id"]) \
                    .execute()
                log(f"  ✅ Match PIVA+data → scadenza {target['id']} (fatt: {target['fattura_riferimento']})")
                return True
    
    return False


# ─── Main ────────────────────────────────────────────────────────────
def main():
    log("=" * 60)
    log("📄 IMPORT FATTURE PDF → Supabase Storage + Associazione Scadenze")
    log(f"Sorgente PDF: {PDF_SOURCE_PATH}")
    log(f"Sorgente XML: {XML_SOURCE_PATH}")
    log(f"Bucket: {BUCKET_NAME}")
    log("=" * 60)
    
    if not PDF_SOURCE_PATH.exists():
        log(f"❌ Cartella PDF non trovata: {PDF_SOURCE_PATH}")
        sys.exit(1)
    if not XML_SOURCE_PATH.exists():
        log(f"❌ Cartella XML non trovata: {XML_SOURCE_PATH}")
        sys.exit(1)
    
    # 1. Costruisci indice XML
    log("🔧 Costruzione indice XML...")
    xml_index = build_xml_index(XML_SOURCE_PATH)
    log(f"   {len(xml_index)} XML indicizzati")
    
    # 2. Scansiona PDF
    pdf_files = list(PDF_SOURCE_PATH.glob("*.pdf")) + list(PDF_SOURCE_PATH.glob("*.PDF"))
    pdf_files = list({p.resolve(): p for p in pdf_files}.values())
    log(f"📁 Trovati {len(pdf_files)} file PDF")
    
    stats = {"uploadati": 0, "matchati": 0, "non_matchati": 0, "errori": 0, "no_xml": 0, "gia_presenti": 0}
    non_matchati_list = []

    # Pre-carica lista file già presenti su Storage per skip incrementale
    log("🔧 Recupero lista PDF già presenti su Storage...")
    existing_files = set()
    try:
        for anno in ["2024", "2025", "2026"]:
            result = supabase.storage.from_(BUCKET_NAME).list(anno, {"limit": 10000})
            for f in (result or []):
                existing_files.add(f["name"])
        log(f"   {len(existing_files)} file già su Storage")
    except Exception as e:
        log(f"  ⚠️ Impossibile leggere lista Storage: {e} — procedo senza skip")

    for pdf_path in sorted(pdf_files):
        filename = pdf_path.name

        # Skip incrementale: se il file è già su Storage, non riprocessare
        if filename in existing_files:
            stats["gia_presenti"] += 1
            continue

        log(f"\n📄 {filename}")
        
        # 1. Estrai pattern dal nome PDF
        num_file, data_file = estrai_pattern_da_nome(filename)
        if not num_file:
            log(f"  ⚠️ Pattern non riconosciuto nel nome file")
            stats["non_matchati"] += 1
            non_matchati_list.append(f"  - {filename} → (pattern non riconosciuto)")
            continue
        
        # Converti data dd-mm-yyyy → ISO yyyy-mm-dd
        parts = data_file.split("-")
        data_iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
        
        # 2. Cerca XML gemello
        xml_entry = xml_index.get((num_file, data_file))
        piva = None
        if xml_entry:
            xml_path, piva = xml_entry
            # 3. Leggi il vero numero fattura dall'XML
            numero_reale = leggi_numero_da_xml(xml_path)
            if numero_reale:
                log(f"  🔍 XML → Numero: {numero_reale!r}, PIVA: {piva}, data: {data_iso}")
            else:
                log(f"  ⚠️ XML trovato ma tag <Numero> non leggibile, uso nome file")
                numero_reale = num_file
        else:
            log(f"  ⚠️ Nessun XML gemello trovato, uso nome file: {num_file}")
            numero_reale = num_file
            stats["no_xml"] += 1
        
        # 4. Upload su Storage
        file_url = upload_pdf(str(pdf_path), filename)
        if not file_url:
            stats["errori"] += 1
            continue
        
        stats["uploadati"] += 1
        log(f"  ☁️ Caricato su Storage")
        
        # 5. Matching con scadenze (numero reale da XML + data + PIVA)
        matched = match_e_aggiorna(numero_reale, data_iso, piva, file_url)
        if matched:
            stats["matchati"] += 1
        else:
            stats["non_matchati"] += 1
            non_matchati_list.append(f"  - {filename} → fatt={numero_reale!r} del {data_iso}")
            log(f"  ℹ️ Nessuna scadenza trovata per fatt={numero_reale!r} del {data_iso}")
    
    # Riepilogo
    log("\n" + "=" * 60)
    log("📊 RIEPILOGO")
    log(f"  File PDF trovati:       {len(pdf_files)}")
    log(f"  Gia presenti (skip):   {stats['gia_presenti']}")
    log(f"  Nuovi caricati:        {stats['uploadati']}")
    log(f"  Associati a scadenze:   {stats['matchati']}")
    log(f"  Non associati:          {stats['non_matchati']}")
    log(f"  Senza XML gemello:      {stats['no_xml']}")
    log(f"  Errori upload:          {stats['errori']}")
    
    if non_matchati_list:
        log(f"\n⚠️ PDF caricati ma NON associati ({len(non_matchati_list)}):")
        for line in non_matchati_list:
            log(line)
    
    log("=" * 60)
    
    # Salva log
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n\n")
    
    log(f"📝 Log salvato in {LOG_FILE}")

    if "--json" in sys.argv:
        print(f"###JSON_RESULT###{json.dumps(stats)}")


if __name__ == "__main__":
    main()
