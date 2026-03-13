"""
Script: import_fatture_pdf.py
Scansiona la cartella PDF fatture, le carica su Supabase Storage
e le associa alle scadenze_pagamento tramite matching diretto dal nome file.

Logica:
  1. Pre-carica in memoria: scadenze aperte (senza file_url) + mappa PIVA->soggetto
  2. Per ogni PDF in Archivio_pdf, estrae dal nome: numero, data, PIVA
     Pattern: Fatt.Acq._N.{numero}_del_{dd-mm-yyyy}_{PIVA}.pdf
  3. Matching in memoria (0 query per-file):
     1) normalizza(fattura_riferimento) == normalizza(numero) + data esatta
     2) PIVA soggetto + data esatta
  4. Upload PDF su Storage + update file_url sulla scadenza

Requisiti:
  pip install supabase python-dotenv

Uso:
  python scripts/import_fatture_pdf.py [--json] [--days N]
"""

import os
import re
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

try:
    from supabase import create_client
except ImportError:
    print("supabase non installato. Esegui: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

# --- Configurazione ---
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_script_dir, "..")
load_dotenv(os.path.join(_project_root, ".env.local"))
load_dotenv(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET_NAME = "fatture-pdf"

_base = Path(r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025")
_contab = next((d for d in _base.iterdir() if d.name.lower().startswith("contabilit")), None)
if not _contab:
    print("Cartella contabilita non trovata sotto", _base)
    sys.exit(1)

PDF_SOURCE_PATH = _contab / "Archivio_pdf"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Variabili d'ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Log ---
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


# --- Estrai pattern dal nome file ---
def estrai_pattern_da_nome(filename: str):
    """Estrae (numero, data_ddmmyyyy) dal nome file PDF/XML."""
    match = re.search(r"_N\.(.+?)_del_(\d{2}-\d{2}-\d{4})_", filename)
    if match:
        return match.group(1), match.group(2)
    match = re.search(r"^(.+?)_del_(\d{2}-\d{2}-\d{4})_", filename)
    if match:
        return match.group(1), match.group(2)
    return None, None


def estrai_piva_da_nome(filename: str) -> str | None:
    """Estrae la PIVA dal nome file (dopo la data)."""
    match = re.search(r"_del_\d{2}-\d{2}-\d{4}_([A-Z]{2}\d[\w]+)", filename)
    if match:
        raw = match.group(1)
        if len(raw) > 2 and raw[:2].isalpha():
            return raw[2:]
    return None


def normalizza_num(s: str) -> str:
    """Normalizza numero fattura per confronto: rimuove separatori."""
    if not s:
        return ""
    return re.sub(r"[/\\\s\-._]", "", s).upper()


# --- Upload su Supabase Storage ---
def upload_pdf(filepath: str, filename: str) -> str | None:
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
        log(f"  Errore upload {filename}: {e}")
        return None


# --- Main ---
def main():
    log("=" * 60)
    log("IMPORT FATTURE PDF -> Supabase Storage + Associazione Scadenze")
    log(f"Sorgente PDF: {PDF_SOURCE_PATH}")
    log(f"Bucket: {BUCKET_NAME}")
    log("=" * 60)

    if not PDF_SOURCE_PATH.exists():
        log(f"Cartella PDF non trovata: {PDF_SOURCE_PATH}")
        sys.exit(1)

    # Flag --days
    giorni_recenti = 7
    for i, arg in enumerate(sys.argv):
        if arg.startswith("--days="):
            try:
                giorni_recenti = int(arg.split("=")[1])
            except ValueError:
                pass
        elif arg == "--days" and i + 1 < len(sys.argv):
            try:
                giorni_recenti = int(sys.argv[i + 1])
            except ValueError:
                pass

    # 1. Pre-carica scadenze aperte (senza file_url) in memoria
    log("Pre-caricamento scadenze aperte...")
    scadenze_per_data: dict[str, list[dict]] = defaultdict(list)
    scadenze_con_pdf: set[str] = set()  # set di (fattura_rif_norm, data_iso) gia' associati

    try:
        # Scadenze senza file_url (da associare)
        res = supabase.table("scadenze_pagamento") \
            .select("id, fattura_riferimento, data_emissione, soggetto_id") \
            .is_("file_url", "null") \
            .execute()
        for r in (res.data or []):
            if r.get("data_emissione"):
                scadenze_per_data[r["data_emissione"]].append(r)
        tot_aperte = sum(len(v) for v in scadenze_per_data.values())
        log(f"   {tot_aperte} scadenze aperte (senza PDF)")

        # Scadenze con file_url (per skip)
        res2 = supabase.table("scadenze_pagamento") \
            .select("fattura_riferimento, data_emissione") \
            .not_.is_("file_url", "null") \
            .execute()
        for r in (res2.data or []):
            if r.get("fattura_riferimento") and r.get("data_emissione"):
                key = normalizza_num(r["fattura_riferimento"]) + "|" + r["data_emissione"]
                scadenze_con_pdf.add(key)
        log(f"   {len(scadenze_con_pdf)} scadenze gia' con PDF")
    except Exception as e:
        log(f"   Errore pre-caricamento scadenze: {e}")
        sys.exit(1)

    # 2. Pre-carica mappa PIVA -> soggetto_id
    log("Pre-caricamento mappa PIVA...")
    piva_to_soggetto: dict[str, str] = {}
    try:
        res = supabase.table("anagrafica_soggetti") \
            .select("id, partita_iva, codice_fiscale") \
            .execute()
        for r in (res.data or []):
            if r.get("partita_iva"):
                piva_to_soggetto[r["partita_iva"]] = r["id"]
                if len(r["partita_iva"]) > 11:
                    piva_to_soggetto[r["partita_iva"][:11]] = r["id"]
            if r.get("codice_fiscale"):
                piva_to_soggetto[r["codice_fiscale"]] = r["id"]
        log(f"   {len(piva_to_soggetto)} chiavi PIVA/CF mappate")
    except Exception as e:
        log(f"   Errore pre-caricamento soggetti: {e}")

    # 3. Scansiona PDF recenti (filtro solo per data nel nome, zero stat() su rete)
    log(f"Scansione PDF (ultimi {giorni_recenti} giorni)...")
    data_limite = datetime.now() - timedelta(days=giorni_recenti)
    all_pdf_files = list(PDF_SOURCE_PATH.glob("*.pdf")) + list(PDF_SOURCE_PATH.glob("*.PDF"))
    # Deduplica case-insensitive senza resolve() (evita stat su rete)
    seen_names: set[str] = set()
    unique_pdfs: list[Path] = []
    for p in all_pdf_files:
        low = p.name.lower()
        if low not in seen_names:
            seen_names.add(low)
            unique_pdfs.append(p)
    all_pdf_files = unique_pdfs

    pdf_files = []
    for p in all_pdf_files:
        _, data_str = estrai_pattern_da_nome(p.name)
        if not data_str:
            continue  # skip file senza pattern data nel nome
        try:
            data_file = datetime.strptime(data_str, "%d-%m-%Y")
            if data_file >= data_limite:
                pdf_files.append(p)
        except ValueError:
            pass

    log(f"   Totale PDF su disco: {len(all_pdf_files)}, recenti ({giorni_recenti}gg): {len(pdf_files)}")

    stats = {"uploadati": 0, "matchati": 0, "non_matchati": 0, "errori": 0, "gia_presenti": 0, "no_pattern": 0}
    non_matchati_list = []

    # 4. Processa ogni PDF
    for pdf_path in sorted(pdf_files):
        filename = pdf_path.name
        num_file, data_file = estrai_pattern_da_nome(filename)
        if not num_file:
            stats["no_pattern"] += 1
            non_matchati_list.append(f"  - {filename} -> (pattern non riconosciuto)")
            continue

        parts = data_file.split("-")
        data_iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
        num_norm = normalizza_num(num_file)
        piva = estrai_piva_da_nome(filename)

        # Skip se gia' associato
        skip_key = num_norm + "|" + data_iso
        if skip_key in scadenze_con_pdf:
            stats["gia_presenti"] += 1
            continue

        # Matching in memoria
        candidati = scadenze_per_data.get(data_iso, [])
        target = None

        # Strategia 1: numero normalizzato + data
        for sc in candidati:
            if normalizza_num(sc.get("fattura_riferimento", "")) == num_norm:
                target = sc
                break

        # Strategia 2: PIVA + data
        if not target and piva:
            soggetto_id = piva_to_soggetto.get(piva)
            if not soggetto_id and len(piva) > 11:
                soggetto_id = piva_to_soggetto.get(piva[:11])
            if soggetto_id:
                matches_piva = [sc for sc in candidati if sc.get("soggetto_id") == soggetto_id]
                if len(matches_piva) == 1:
                    target = matches_piva[0]
                elif len(matches_piva) > 1:
                    # Scegli quello con fattura_riferimento piu' simile
                    best = max(matches_piva, key=lambda s: (
                        1000 if normalizza_num(s.get("fattura_riferimento", "")) == num_norm else
                        len(os.path.commonprefix([normalizza_num(s.get("fattura_riferimento", "")), num_norm]))
                    ))
                    target = best

        if not target:
            stats["non_matchati"] += 1
            non_matchati_list.append(f"  - {filename} -> num={num_file!r} del {data_iso} piva={piva}")
            continue

        # Upload PDF
        log(f"\n  {filename}")
        log(f"  -> scadenza {target['id']} (fatt: {target.get('fattura_riferimento', '?')})")

        file_url = upload_pdf(str(pdf_path), filename)
        if not file_url:
            stats["errori"] += 1
            continue

        stats["uploadati"] += 1

        # Update file_url sulla scadenza
        try:
            supabase.table("scadenze_pagamento") \
                .update({"file_url": file_url}) \
                .eq("id", target["id"]) \
                .execute()
            stats["matchati"] += 1
            # Rimuovi dalla lista aperte (evita doppi match)
            candidati.remove(target)
            scadenze_con_pdf.add(skip_key)
        except Exception as e:
            log(f"  Errore update scadenza {target['id']}: {e}")
            stats["errori"] += 1

    # Riepilogo
    log("\n" + "=" * 60)
    log("RIEPILOGO")
    log(f"  PDF recenti scansionati: {len(pdf_files)}")
    log(f"  Gia' con PDF (skip):     {stats['gia_presenti']}")
    log(f"  Pattern non riconosciuto: {stats['no_pattern']}")
    log(f"  Nuovi caricati:           {stats['uploadati']}")
    log(f"  Associati a scadenze:     {stats['matchati']}")
    log(f"  Non associati:            {stats['non_matchati']}")
    log(f"  Errori:                   {stats['errori']}")

    if non_matchati_list:
        log(f"\nPDF non associati ({len(non_matchati_list)}):")
        for line in non_matchati_list:
            log(line)

    log("=" * 60)

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("\n".join(log_lines) + "\n\n")

    if "--json" in sys.argv:
        print(f"###JSON_RESULT###{json.dumps(stats)}")


if __name__ == "__main__":
    main()
