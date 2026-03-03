"""
import_anagrafiche_fornitori_xml.py
====================================
Scansiona ricorsivamente una cartella di fatture XML di acquisto (2024+),
estrae i dati del FORNITORE (CedentePrestatore) e aggiorna / inserisce
i record in anagrafica_soggetti con tipo='fornitore'.

NON tocca importi, scadenze o fatture — solo anagrafiche.

Uso:
    python scripts/import_anagrafiche_fornitori_xml.py            # modalità live
    python scripts/import_anagrafiche_fornitori_xml.py --dry-run  # solo stampa, nessuna scrittura
"""

import os
import sys
import re
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Fix encoding terminale Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# ─── CARTELLA XML ─────────────────────────────────────────────────────────────
XML_DIR = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\archivio_xml_2024"

# ─── ENCODINGS da provare ─────────────────────────────────────────────────────
ENCODINGS = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def strip_namespaces(xml_string: str) -> str:
    # 1. Rimuove dichiarazioni xmlns (sia default che prefissate)
    xml_string = re.sub(r'\s+xmlns(?::\w+)?="[^"]+"', '', xml_string)
    # 2. Rimuove prefissi namespace dai nomi dei tag: <p:Foo> → <Foo>, </p:Foo> → </Foo>
    xml_string = re.sub(r'(</?)\w+:', r'\1', xml_string)
    # 3. Rimuove attributi con prefisso namespace: xsi:type="..." → rimosso
    xml_string = re.sub(r'\s+\w+:\w+="[^"]*"', '', xml_string)
    return xml_string


def read_xml(path: str) -> str | None:
    """Legge il file provando vari encoding."""
    for enc in ENCODINGS:
        try:
            with open(path, "r", encoding=enc, errors="strict") as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue
    # Ultimo tentativo con errors='ignore'
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def normalizza_piva(valore: str | None) -> str | None:
    """Normalizza P.IVA: rimuove prefisso IT, zfill a 11 cifre."""
    if not valore:
        return None
    v = valore.strip().upper()
    if v.startswith("IT"):
        v = v[2:]
    if v.isdigit():
        v = v.lstrip("0").zfill(11)
    return v or None


def estrai_fornitore(root: ET.Element) -> dict | None:
    """
    Estrae i dati del fornitore dal nodo CedentePrestatore.
    Restituisce un dict con i campi anagrafica o None se non trovato.
    """
    cedente = root.find(".//CedentePrestatore")
    if cedente is None:
        return None

    dati_anag = cedente.find(".//DatiAnagrafici")
    if dati_anag is None:
        return None

    # Ragione sociale
    anag = dati_anag.find(".//Anagrafica")
    ragione_sociale = None
    if anag is not None:
        ragione_sociale = anag.findtext("Denominazione")
        if not ragione_sociale:
            nome    = anag.findtext("Nome", "")
            cognome = anag.findtext("Cognome", "")
            ragione_sociale = f"{nome} {cognome}".strip() or None

    if not ragione_sociale:
        return None

    # P.IVA e CF
    piva = normalizza_piva(dati_anag.findtext(".//IdFiscaleIVA/IdCodice"))
    cf   = normalizza_piva(dati_anag.findtext(".//CodiceFiscale"))

    # Sede (indirizzo)
    sede = cedente.find(".//Sede")
    indirizzo = None
    cap       = None
    comune    = None
    provincia = None
    if sede is not None:
        indirizzo = sede.findtext("Indirizzo")
        cap       = sede.findtext("CAP")
        comune    = sede.findtext("Comune")
        provincia = sede.findtext("Provincia")

    return {
        "ragione_sociale": ragione_sociale.strip(),
        "partita_iva":     piva,
        "codice_fiscale":  cf,
        "indirizzo":       indirizzo,
        "cap":             cap,
        "comune":          comune,
        "provincia":       provincia,
        "tipo":            "fornitore",
    }


def trova_soggetto(supabase: Client, piva: str | None, cf: str | None, ragione_sociale: str) -> str | None:
    """
    Cerca il soggetto in anagrafica_soggetti.
    Priorità: P.IVA → CF → ragione_sociale esatta.
    Restituisce l'ID se trovato, None altrimenti.
    """
    if piva:
        res = supabase.table("anagrafica_soggetti").select("id").eq("partita_iva", piva).execute()
        if res.data:
            return res.data[0]["id"]
    if cf:
        res = supabase.table("anagrafica_soggetti").select("id").eq("codice_fiscale", cf).execute()
        if res.data:
            return res.data[0]["id"]
    res = supabase.table("anagrafica_soggetti").select("id").eq("ragione_sociale", ragione_sociale).execute()
    if res.data:
        return res.data[0]["id"]
    return None


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("🔍  MODALITÀ DRY-RUN — nessuna scrittura su Supabase\n")

    # Carica .env
    base_dir = Path(__file__).resolve().parent.parent
    for env_file in [".env.local", ".env"]:
        env_path = base_dir / env_file
        if env_path.exists():
            load_dotenv(env_path)
            print(f"✅  Variabili caricate da: {env_path}")
            break
    else:
        print("❌  File .env.local / .env non trovato!")
        sys.exit(1)

    SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌  NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti nel .env")
        sys.exit(1)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"✅  Connesso a Supabase\n")

    # Raccoglie tutti i file XML ricorsivamente
    xml_dir = Path(XML_DIR)
    if not xml_dir.exists():
        print(f"❌  Cartella non trovata: {XML_DIR}")
        sys.exit(1)

    file_xml = sorted(xml_dir.rglob("*.xml"))
    print(f"📁  Cartella: {XML_DIR}")
    print(f"📄  File XML trovati: {len(file_xml)}\n")

    # Contatori
    n_inseriti   = 0
    n_aggiornati = 0
    n_presenti   = 0
    n_saltati    = 0
    n_errori     = 0

    # Cache per evitare doppi upsert nella stessa sessione (chiave: piva o ragione_sociale)
    processati: set[str] = set()

    for fpath in file_xml:
        try:
            xml_raw = read_xml(str(fpath))
            if not xml_raw:
                print(f"  ⚠️  {fpath.name}: impossibile leggere")
                n_errori += 1
                continue

            clean = strip_namespaces(xml_raw)
            root  = ET.fromstring(clean)

            fornitore = estrai_fornitore(root)
            if not fornitore:
                print(f"  ⚠️  {fpath.name}: CedentePrestatore non trovato — saltato")
                n_saltati += 1
                continue

            rs   = fornitore["ragione_sociale"]
            piva = fornitore["partita_iva"]
            cf   = fornitore["codice_fiscale"]

            # Chiave dedup in-memory
            chiave = piva or cf or rs
            if chiave in processati:
                print(f"  ↩️   {rs} — già processato in questa sessione, skip")
                n_presenti += 1
                continue
            processati.add(chiave)

            soggetto_id = trova_soggetto(supabase, piva, cf, rs)

            # Campi da scrivere (aggiorna solo se il valore è presente nell'XML)
            campi_update = {k: v for k, v in fornitore.items() if v is not None}

            if soggetto_id:
                # Soggetto esistente → aggiorna i campi anagrafici
                print(f"  🔄  {rs} (P.IVA: {piva or cf}) — AGGIORNATO")
                if not dry_run:
                    supabase.table("anagrafica_soggetti").update(campi_update).eq("id", soggetto_id).execute()
                n_aggiornati += 1
            else:
                # Soggetto nuovo → inserisce
                print(f"  🌟  {rs} (P.IVA: {piva or cf}) — INSERITO")
                if not dry_run:
                    supabase.table("anagrafica_soggetti").insert(fornitore).execute()
                n_inseriti += 1

        except ET.ParseError as e:
            print(f"  ❌  {fpath.name}: XML malformato — {e}")
            n_errori += 1
        except Exception as e:
            print(f"  ❌  {fpath.name}: errore — {e}")
            traceback.print_exc()
            n_errori += 1

    # Riepilogo finale
    print("\n" + "=" * 55)
    print("📊  RIEPILOGO IMPORTAZIONE ANAGRAFICHE FORNITORI")
    print("=" * 55)
    print(f"  File XML elaborati  : {len(file_xml)}")
    print(f"  Fornitori univoci   : {len(processati)}")
    print(f"  🌟 Nuovi inseriti    : {n_inseriti}")
    print(f"  🔄 Aggiornati        : {n_aggiornati}")
    print(f"  ↩️  Già presenti (dup): {n_presenti}")
    print(f"  ⚠️  Saltati (no dati): {n_saltati}")
    print(f"  ❌ Errori            : {n_errori}")
    if dry_run:
        print("\n  ⚠️  DRY-RUN: nessuna modifica effettuata su Supabase")
    print("=" * 55)


if __name__ == "__main__":
    main()
    input("\nPremi INVIO per chiudere...")
