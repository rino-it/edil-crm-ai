"""
Script: import_fatture_pdf.py
Scansiona la cartella condivisa tic23 per file PDF fatture,
li carica su Supabase Storage e aggiorna scadenze_pagamento.file_url.

Requisiti:
  pip install supabase pdfplumber python-dotenv

Uso:
  python scripts/import_fatture_pdf.py
"""

import os
import re
import sys
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    print("❌ pdfplumber non installato. Esegui: pip install pdfplumber")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("❌ supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

# ─── Configurazione ────────────────────────────────────────────────
load_dotenv()

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


# ─── Estrai numero fattura dal PDF ──────────────────────────────────
def estrai_numero_fattura_da_pdf(filepath: str) -> str | None:
    """Prova ad estrarre il numero fattura dal contenuto del PDF."""
    try:
        with pdfplumber.open(filepath) as pdf:
            if not pdf.pages:
                return None
            text = pdf.pages[0].extract_text() or ""
            
            # Pattern comuni per numero fattura
            patterns = [
                r"[Ff]attura\s*(?:n\.?|nr\.?|num\.?|numero)\s*[:\s]*([A-Z0-9/\-]+)",
                r"[Nn]\.\s*[Ff]att(?:ura)?\.?\s*[:\s]*([A-Z0-9/\-]+)",
                r"[Dd]ocumento\s*(?:n\.?|nr\.?)\s*[:\s]*([A-Z0-9/\-]+)",
                r"(?:FT|FA|FV|NF)\s*[/\-]?\s*(\d+[/\-]\d+)",
            ]
            
            for pattern in patterns:
                match = re.search(pattern, text)
                if match:
                    return match.group(1).strip()
            
            return None
    except Exception as e:
        log(f"  ⚠️ Errore estrazione testo PDF: {e}")
        return None


def estrai_numero_da_nome_file(filename: str) -> str | None:
    """Prova ad estrarre il numero fattura dal nome del file."""
    # Rimuovi estensione
    name = Path(filename).stem
    
    # Pattern: "FT-001-2025", "FA_123_2025", "NF-2025-001", "Fatt_123", etc.
    patterns = [
        r"((?:FT|FA|FV|NF|NC)[_\-/]?\d+[_\-/]?\d*)",
        r"(\d{1,6}[/_\-]\d{2,4})",
        r"[Ff]att(?:ura)?[_\-\s]*(\d+)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    
    return None


# ─── Upload su Supabase Storage ─────────────────────────────────────
def upload_pdf(filepath: str, filename: str) -> str | None:
    """Upload del file su Supabase Storage. Restituisce l'URL pubblico."""
    try:
        storage_path = f"2025/{filename}"
        
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
def match_e_aggiorna(numero_fattura: str, file_url: str) -> bool:
    """Cerca la scadenza con fattura_riferimento matching e aggiorna file_url."""
    if not numero_fattura:
        return False
    
    # Cerca match esatto o parziale (ILIKE)
    result = supabase.table("scadenze_pagamento") \
        .select("id, fattura_riferimento, file_url") \
        .ilike("fattura_riferimento", f"%{numero_fattura}%") \
        .is_("file_url", "null") \
        .execute()
    
    if result.data and len(result.data) > 0:
        for scadenza in result.data:
            supabase.table("scadenze_pagamento") \
                .update({"file_url": file_url}) \
                .eq("id", scadenza["id"]) \
                .execute()
            log(f"  ✅ Associata a scadenza {scadenza['id']} (fatt: {scadenza['fattura_riferimento']})")
        return True
    
    return False


# ─── Main ────────────────────────────────────────────────────────────
def main():
    log("=" * 60)
    log("📄 IMPORT FATTURE PDF da tic23")
    log(f"Sorgente: {PDF_SOURCE_PATH}")
    log("=" * 60)
    
    source_dir = Path(PDF_SOURCE_PATH)
    if not source_dir.exists():
        log(f"❌ Cartella sorgente non trovata: {PDF_SOURCE_PATH}")
        log("   Assicurarsi che il percorso di rete sia accessibile.")
        sys.exit(1)
    
    pdf_files = list(source_dir.glob("*.pdf")) + list(source_dir.glob("*.PDF"))
    log(f"📁 Trovati {len(pdf_files)} file PDF")
    
    stats = {"uploadati": 0, "matchati": 0, "errori": 0, "gia_presenti": 0}
    
    for pdf_path in sorted(pdf_files):
        filename = pdf_path.name
        log(f"\n📄 {filename}")
        
        # 1. Estrai numero fattura (prima dal nome file, poi dal contenuto)
        numero_fattura = estrai_numero_da_nome_file(filename)
        if not numero_fattura:
            numero_fattura = estrai_numero_fattura_da_pdf(str(pdf_path))
        
        if numero_fattura:
            log(f"  🔍 Numero fattura estratto: {numero_fattura}")
        else:
            log(f"  ⚠️ Numero fattura non trovato")
        
        # 2. Upload su Storage
        file_url = upload_pdf(str(pdf_path), filename)
        if not file_url:
            stats["errori"] += 1
            continue
        
        stats["uploadati"] += 1
        log(f"  ☁️ Caricato: {file_url[:80]}...")
        
        # 3. Matching con scadenze
        if numero_fattura:
            matched = match_e_aggiorna(numero_fattura, file_url)
            if matched:
                stats["matchati"] += 1
            else:
                log(f"  ℹ️ Nessuna scadenza trovata per fattura '{numero_fattura}'")
    
    # Riepilogo
    log("\n" + "=" * 60)
    log("📊 RIEPILOGO")
    log(f"  File processati: {len(pdf_files)}")
    log(f"  Caricati su Storage: {stats['uploadati']}")
    log(f"  Associati a scadenze: {stats['matchati']}")
    log(f"  Errori: {stats['errori']}")
    log("=" * 60)
    
    # Salva log
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n\n")
    
    log(f"📝 Log salvato in {LOG_FILE}")


if __name__ == "__main__":
    main()
