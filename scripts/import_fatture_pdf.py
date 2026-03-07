"""
Script: import_fatture_pdf.py
Scansiona la cartella PDF fatture di tic23, le carica su Supabase Storage
e le associa alle scadenze_pagamento tramite matching nome file.

Matching: i file PDF e XML condividono il pattern "N.{numero}_del_{dd-mm-yyyy}"
  - PDF: Fatt.Acq._N.1A_del_27-01-2026_uzw00vl46t.pdf
  - XML: Fatt.Acq._N.1A_del_27-01-2026_IT00811260165_00B8E.xml
  => numero_fattura="1A", data_emissione="2026-01-27" => match in scadenze_pagamento

Requisiti:
  pip install supabase python-dotenv

Uso:
  python scripts/import_fatture_pdf.py
"""

import os
import re
import sys
from pathlib import Path
from datetime import datetime

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

# ─── Configurazione ────────────────────────────────────────────────
# Carica .env.local dalla root del progetto
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_script_dir, "..")
load_dotenv(os.path.join(_project_root, ".env.local"))
load_dotenv(os.path.join(_project_root, ".env"))  # fallback

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET_NAME = "fatture-pdf"

# Path sorgente PDF da tic23
PDF_SOURCE_PATH = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_pdf"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Variabili d'ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Log ────────────────────────────────────────────────────────────
LOG_FILE = os.path.join(os.path.dirname(__file__), "..", "import_fatture_pdf_log.txt")
log_lines = []

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    log_lines.append(line)


# ─── Estrai numero fattura e data dal nome file ─────────────────────
def estrai_da_nome_file(filename: str):
    """
    Dal nome file tipo:
      "Fatt.Acq._N.1A_del_27-01-2026_uzw00vl46t.pdf"
      "237_del_02-02-2026_ovemzvg68d.pdf"
    estrae numero_fattura e data ISO.
    Restituisce (numero, data_iso) o (None, None).
    """
    # Pattern 1: Fatt.Acq._N.{numero}_del_{dd-mm-yyyy}
    # Il numero può contenere _ (es. N.17_1036, N.2_001, N.5_2026)
    match = re.search(r"_N\.(.+?)_del_(\d{2})-(\d{2})-(\d{4})", filename)
    if match:
        numero = match.group(1)
        giorno, mese, anno = match.group(2), match.group(3), match.group(4)
        return numero, f"{anno}-{mese}-{giorno}"
    
    # Pattern 2: {numero}_del_{dd-mm-yyyy} (senza prefisso Fatt.Acq._N.)
    match = re.search(r"^([^_]+)_del_(\d{2})-(\d{2})-(\d{4})", filename)
    if match:
        numero = match.group(1)
        giorno, mese, anno = match.group(2), match.group(3), match.group(4)
        return numero, f"{anno}-{mese}-{giorno}"
    
    return None, None


# ─── Upload su Supabase Storage ─────────────────────────────────────
def upload_pdf(filepath: str, filename: str) -> str | None:
    """Upload del file su Supabase Storage. Restituisce l'URL pubblico."""
    try:
        # Organizza per anno
        anno = "2026"
        match = re.search(r"(\d{4})", filename)
        if match:
            anno = match.group(1)
        
        storage_path = f"{anno}/{filename}"
        
        with open(filepath, "rb") as f:
            file_bytes = f.read()
        
        # Upload (upsert per evitare errori su file già esistenti)
        supabase.storage.from_(BUCKET_NAME).upload(
            storage_path,
            file_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"}
        )
        
        # Genera URL pubblico
        res = supabase.storage.from_(BUCKET_NAME).get_public_url(storage_path)
        return res
    except Exception as e:
        log(f"  ❌ Errore upload {filename}: {e}")
        return None


# ─── Matching con scadenze_pagamento ─────────────────────────────────
def match_e_aggiorna(numero_fattura: str, data_emissione: str, file_url: str) -> bool:
    """
    Cerca la scadenza con fattura_riferimento + data_emissione matching 
    e aggiorna file_url.
    
    Strategia di matching (in ordine di precisione):
    1. fattura_riferimento ESATTO + data_emissione ESATTA
    2. fattura_riferimento ESATTO (senza filtro data)
    3. fattura_riferimento ILIKE parziale + data_emissione ESATTA
    """
    if not numero_fattura:
        return False
    
    matched = False
    
    # Strategia 1: Match esatto fattura + data
    if data_emissione:
        result = supabase.table("scadenze_pagamento") \
            .select("id, fattura_riferimento, data_emissione, file_url") \
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
                log(f"  ✅ Match esatto → scadenza {scadenza['id']} (fatt: {scadenza['fattura_riferimento']}, data: {scadenza.get('data_emissione', 'N/D')})")
            return True
    
    # Strategia 2: Match solo per fattura_riferimento esatto
    result = supabase.table("scadenze_pagamento") \
        .select("id, fattura_riferimento, data_emissione, file_url") \
        .eq("fattura_riferimento", numero_fattura) \
        .is_("file_url", "null") \
        .execute()
    
    if result.data and len(result.data) > 0:
        for scadenza in result.data:
            supabase.table("scadenze_pagamento") \
                .update({"file_url": file_url}) \
                .eq("id", scadenza["id"]) \
                .execute()
            log(f"  ✅ Match fattura → scadenza {scadenza['id']} (fatt: {scadenza['fattura_riferimento']})")
        return True
    
    # Strategia 3: Match parziale (ILIKE) + data
    if data_emissione:
        result = supabase.table("scadenze_pagamento") \
            .select("id, fattura_riferimento, data_emissione, file_url") \
            .ilike("fattura_riferimento", f"%{numero_fattura}%") \
            .eq("data_emissione", data_emissione) \
            .is_("file_url", "null") \
            .execute()
        
        if result.data and len(result.data) > 0:
            for scadenza in result.data:
                supabase.table("scadenze_pagamento") \
                    .update({"file_url": file_url}) \
                    .eq("id", scadenza["id"]) \
                    .execute()
                log(f"  ✅ Match parziale → scadenza {scadenza['id']} (fatt: {scadenza['fattura_riferimento']})")
            return True
    
    return False


# ─── Main ────────────────────────────────────────────────────────────
def main():
    log("=" * 60)
    log("📄 IMPORT FATTURE PDF → Supabase Storage + Associazione Scadenze")
    log(f"Sorgente: {PDF_SOURCE_PATH}")
    log(f"Bucket: {BUCKET_NAME}")
    log("=" * 60)
    
    source_dir = Path(PDF_SOURCE_PATH)
    if not source_dir.exists():
        log(f"❌ Cartella sorgente non trovata: {PDF_SOURCE_PATH}")
        log("   Assicurarsi che il percorso di rete sia accessibile.")
        sys.exit(1)
    
    pdf_files = list(source_dir.glob("*.pdf")) + list(source_dir.glob("*.PDF"))
    # Rimuovi duplicati
    pdf_files = list({p.resolve(): p for p in pdf_files}.values())
    log(f"📁 Trovati {len(pdf_files)} file PDF")
    
    stats = {"uploadati": 0, "matchati": 0, "non_matchati": 0, "errori": 0}
    non_matchati_list = []
    
    for pdf_path in sorted(pdf_files):
        filename = pdf_path.name
        log(f"\n📄 {filename}")
        
        # 1. Estrai numero fattura e data dal nome file
        numero_fattura, data_emissione = estrai_da_nome_file(filename)
        
        if numero_fattura:
            log(f"  🔍 Estratto: N.{numero_fattura} del {data_emissione}")
        else:
            log(f"  ⚠️ Pattern N.xxx_del_dd-mm-yyyy non trovato nel nome file")
        
        # 2. Upload su Storage
        file_url = upload_pdf(str(pdf_path), filename)
        if not file_url:
            stats["errori"] += 1
            continue
        
        stats["uploadati"] += 1
        log(f"  ☁️ Caricato su Storage")
        
        # 3. Matching con scadenze
        if numero_fattura:
            matched = match_e_aggiorna(numero_fattura, data_emissione, file_url)
            if matched:
                stats["matchati"] += 1
            else:
                stats["non_matchati"] += 1
                non_matchati_list.append(f"  - {filename} → N.{numero_fattura} del {data_emissione}")
                log(f"  ℹ️ Nessuna scadenza trovata per N.{numero_fattura} del {data_emissione}")
        else:
            stats["non_matchati"] += 1
            non_matchati_list.append(f"  - {filename} → (pattern non riconosciuto)")
    
    # Riepilogo
    log("\n" + "=" * 60)
    log("📊 RIEPILOGO")
    log(f"  File PDF trovati:       {len(pdf_files)}")
    log(f"  Caricati su Storage:    {stats['uploadati']}")
    log(f"  Associati a scadenze:   {stats['matchati']}")
    log(f"  Non associati:          {stats['non_matchati']}")
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


if __name__ == "__main__":
    main()
