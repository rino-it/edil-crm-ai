# coding: utf-8
"""
import_pivot_cashflow.py — Importa storico da CSV Pivot in scadenze_pagamento

La colonna "Scadenza" del CSV diventa data_pianificata nel DB.
Questo "spalma" le fatture scadute nelle settimane corrette del cashflow.

UUID5 deterministico include data_scadenza per differenziare rate split.

Uso:
    python scripts/import_pivot_cashflow.py           # live
    python scripts/import_pivot_cashflow.py --dry-run # solo anteprima
"""
import os, csv, argparse, re
from pathlib import Path
from uuid import NAMESPACE_OID, uuid5
from datetime import datetime, date
from dotenv import load_dotenv
from supabase import create_client, Client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── CONFIGURAZIONE ──────────────────────────────────────────────────────────
# Il file CSV si trova una cartella sopra la root del progetto
CSV_PATH = PROJECT_ROOT / ".." / "pivot cashflow.CSV"
CHECK_CHUNK  = 50    # Supabase PostgREST URL limit (~8KB per GET)
UPSERT_CHUNK = 100

OGGI = date.today().isoformat()

# ─── COLUMN MAPPING (nomi reali dal CSV) ─────────────────────────────────────
COL_APPUNTI   = "APPUNTI"
COL_FORNITORE = "fornitore"
COL_FATTURA   = "fattura nr"
COL_DATA_EMI  = "del"
COL_SCADENZA  = "Scadenza"
COL_SDO       = "Sdo"
COL_CANTIERE  = "Cantiere"
COL_NOTE      = "NOTE"
# Le colonne Importo, Data pagamento, Importo pagamento, Modalità
# hanno nomi con \n o varianti → auto-detect in detect_columns()
COL_IMPORTO      = None   # auto-detect
COL_MODALITA     = None   # auto-detect
COL_DATA_PAG     = None   # auto-detect
COL_IMPORTO_PAG  = None   # auto-detect

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def detect_columns(headers: list[str]) -> dict[str, str]:
    """
    Auto-detect colonne con nomi multi-line o varianti.
    Restituisce dizionario chiave → nome_colonna_reale.
    """
    mapping: dict[str, str] = {}
    for h in headers:
        h_clean = h.replace("\n", " ").strip().lower()
        if "importo" in h_clean and "pagamento" in h_clean:
            mapping["importo_pagamento"] = h
        elif "data" in h_clean and "pagamento" in h_clean:
            mapping["data_pagamento"] = h
        elif "modalit" in h_clean:
            mapping["modalita"] = h
        elif "importo" in h_clean and "pagamento" not in h_clean:
            mapping["importo"] = h
    return mapping


def norm(s) -> str:
    """Normalizza stringa: lowercase, strip, collassa spazi."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def norm_invoice(s) -> str:
    """Normalizza numero fattura: solo alfanumerici lowercase."""
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]", "", norm(str(s)))


def get_float(s) -> float:
    """
    Gestisce formati: € 698.10  /  € 1,390.80  /  -€ 602.00
    Formato: virgola = separatore migliaia, punto = decimali.
    """
    if s is None:
        return 0.0
    text = str(s).strip()
    negativo = "-" in text
    # Rimuovi simbolo €, spazi, segno meno
    text = (text
            .replace("€", "")
            .replace("\u20ac", "")
            .replace("\xa0", "")
            .replace(" ", "")
            .replace("-", ""))
    # Virgola = migliaia → rimuovi; punto = decimali → mantieni
    text = text.replace(",", "")
    try:
        val = float(text)
        return -val if negativo else val
    except (ValueError, AttributeError):
        return 0.0


def get_date(s, force_future: bool = False) -> str | None:
    """Prova vari formati data → ISO string o None.
    Se force_future=True e la data è nel passato, sposta all'anno prossimo.
    Supporta anche formato dd/mm senza anno."""
    if not s:
        return None
    s = str(s).strip()

    parsed = None
    # Prova formati con anno
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            parsed = datetime.strptime(s, fmt).date()
            break
        except ValueError:
            continue

    # Prova formato senza anno: dd/mm
    if parsed is None:
        for fmt in ("%d/%m", "%d-%m"):
            try:
                parsed = datetime.strptime(s, fmt).date().replace(year=date.today().year)
                break
            except ValueError:
                continue

    if parsed is None:
        return None

    # Se force_future e la data è nel passato, sposta all'anno prossimo
    if force_future and parsed < date.today():
        parsed = parsed.replace(year=date.today().year + 1)

    return parsed.isoformat()


def genera_id(soggetto_id: str | None, fattura_norm: str, importo: float, data_scadenza: str = "") -> str:
    """
    UUID5 deterministico.
    Include data_scadenza per differenziare rate split della stessa fattura.
    """
    sid = soggetto_id or "anonimo"
    imp = f"{round(abs(importo), 2):.2f}"
    raw = f"{sid}|{fattura_norm}|{imp}|{data_scadenza}"
    return str(uuid5(NAMESPACE_OID, raw))


def match_soggetto(nome_csv: str, dizionario: dict[str, str]) -> str | None:
    """Fuzzy match contro anagrafica_soggetti (soglia 85)."""
    try:
        from thefuzz import process
    except ImportError:
        return dizionario.get(nome_csv.upper())
    nome_pulito = norm(nome_csv).upper()
    if not nome_pulito:
        return None
    risultato = process.extractOne(nome_pulito, list(dizionario.keys()), score_cutoff=85)
    return dizionario[risultato[0]] if risultato else None


def match_cantiere(nome_csv: str, dizionario_cantieri: dict[str, str]) -> str | None:
    """Fuzzy match contro cantieri (soglia 75)."""
    try:
        from thefuzz import process
    except ImportError:
        return None
    nome_pulito = norm(nome_csv).upper()
    if not nome_pulito:
        return None
    risultato = process.extractOne(nome_pulito, list(dizionario_cantieri.keys()), score_cutoff=75)
    return dizionario_cantieri[risultato[0]] if risultato else None


# ─── CORE ────────────────────────────────────────────────────────────────────

def run_import(dry_run: bool = False):
    print("=" * 60)
    print("  IMPORT PIVOT CASHFLOW → SUPABASE")
    print("=" * 60)

    # 1. Carica anagrafica soggetti
    print("\nCaricamento anagrafica soggetti...")
    res = supabase.table("anagrafica_soggetti").select("id, ragione_sociale").execute()
    dizionario_nomi: dict[str, str] = {
        row["ragione_sociale"].upper(): row["id"] for row in res.data
    }
    print(f"  {len(dizionario_nomi)} soggetti caricati")

    # 2. Carica cantieri
    print("Caricamento cantieri...")
    res_c = supabase.table("cantieri").select("id, codice, nome").execute()
    dizionario_cantieri: dict[str, str] = {}
    for c in res_c.data:
        key = f"{c.get('codice', '')} {c.get('nome', '')}".upper().strip()
        if key:
            dizionario_cantieri[key] = c["id"]
    print(f"  {len(dizionario_cantieri)} cantieri caricati")

    # 3. Leggi CSV
    csv_path = str(CSV_PATH.resolve())
    print(f"\nLettura CSV: {csv_path}")
    righe_raw: list[dict] = []
    ENCODINGS = ["utf-8-sig", "cp1252", "latin-1", "iso-8859-1"]
    loaded = False
    for enc in ENCODINGS:
        try:
            with open(csv_path, encoding=enc, newline="") as f:
                reader = csv.DictReader(f, delimiter=",")
                fieldnames = list(reader.fieldnames or [])
                col_map = detect_columns(fieldnames)
                for row in reader:
                    righe_raw.append(dict(row))
            print(f"  Encoding            : {enc}")
            loaded = True
            break
        except UnicodeDecodeError:
            continue
        except FileNotFoundError:
            print(f"  ❌ File non trovato: {csv_path}")
            return
    if not loaded:
        print(f"  ❌ Impossibile leggere il file con gli encoding: {ENCODINGS}")
        return
    print(f"  Colonne rilevate    : {fieldnames}")
    print(f"  Auto-detect mapping : {col_map}")
    print(f"  {len(righe_raw)} righe lette")
    if righe_raw:
        print(f"  Prima riga: {righe_raw[0]}")

    # Risolvi colonne auto-detect
    col_importo     = col_map.get("importo",          " Importo ")
    col_data_pag    = col_map.get("data_pagamento",    "")
    col_importo_pag = col_map.get("importo_pagamento", "")
    col_modalita    = col_map.get("modalita",          "")

    # 4. Costruisci payload
    print("\nCostruzione payload DB...")
    righe_db: list[dict] = []
    mancanti: list[str]  = []
    nc_count = 0

    for idx, row in enumerate(righe_raw):
        fornitore_raw = (row.get(COL_FORNITORE) or "").strip()
        if not fornitore_raw:
            continue

        importo = get_float(row.get(col_importo, 0))
        if importo == 0:
            continue

        # Note di credito (importo negativo)
        is_nc = importo < 0
        if is_nc:
            nc_count += 1

        fattura_raw  = (row.get(COL_FATTURA) or "").strip()
        fattura_norm = norm_invoice(fattura_raw)
        if not fattura_norm:
            fattura_norm = f"pivot_{idx}"

        data_emissione = get_date(row.get(COL_DATA_EMI, ""))
        data_scadenza  = get_date(row.get(COL_SCADENZA, "")) or data_emissione or OGGI

        sdo = (row.get(COL_SDO) or "").strip().lower()
        importo_pagato_csv = get_float(row.get(col_importo_pag, 0))
        data_pagamento     = get_date(row.get(col_data_pag, ""))
        modalita           = (row.get(col_modalita) or "").strip()
        cantiere_raw       = (row.get(COL_CANTIERE) or "").strip()
        note               = (row.get(COL_NOTE)     or "").strip()
        appunti            = (row.get(COL_APPUNTI)  or "").strip()

        # ── Calcolo stato da foglio MAIN ──────────────────────────
        # Sdo=x → fattura già saldata (esclusa dal cashflow)
        if sdo in ("x", "X"):
            stato          = "pagato"
            importo_pagato = abs(importo_pagato_csv) if importo_pagato_csv else abs(importo)
        elif is_nc:
            # Nota di credito → considerata chiusa
            stato          = "pagato"
            importo_pagato = abs(importo)
        elif data_scadenza < OGGI:
            # Scaduta e non pagata → arretrato aperto
            stato          = "scaduto"
            importo_pagato = abs(importo_pagato_csv)
        else:
            stato          = "da_pagare"
            importo_pagato = abs(importo_pagato_csv)

        soggetto_id = match_soggetto(fornitore_raw, dizionario_nomi)
        if not soggetto_id:
            mancanti.append(fornitore_raw)
            continue

        cantiere_id = match_cantiere(cantiere_raw, dizionario_cantieri) if cantiere_raw else None

        # UUID5 include data_scadenza → rate split della stessa fattura → ID distinti
        uuid_id = genera_id(soggetto_id, fattura_norm, abs(importo), data_scadenza)

        # Descrizione per identificare la sorgente
        descrizione_pivot = f"Schedulazione Pivot: {fornitore_raw}"
        # Note: solo appunti e note operative (senza "pivot" hardcoded)
        note_completa = " | ".join(x for x in [appunti, note] if x).strip(" |") or None

        record: dict = {
            "id":                  uuid_id,
            "soggetto_id":         soggetto_id,
            "tipo":                "uscita",
            "fattura_riferimento": fattura_raw or fattura_norm,
            "importo_totale":      abs(importo),
            "importo_pagato":      importo_pagato,
            "data_emissione":      data_emissione,
            "data_scadenza":       data_scadenza,
            # ← CHIAVE: spalma le fatture nelle settimane corrette del cashflow
            "data_pianificata":    data_scadenza,
            "stato":               stato,
            "metodo_pagamento":    modalita or None,
            "descrizione":         descrizione_pivot,
            "note":                note_completa,
        }
        if cantiere_id:
            record["cantiere_id"] = cantiere_id
        if data_pagamento:
            record["data_pagamento"] = data_pagamento

        righe_db.append(record)

    # Dedup UUID in memoria (ultima riga vince)
    dedup: dict[str, dict] = {}
    for r in righe_db:
        dedup[r["id"]] = r
    righe_db = list(dedup.values())

    print(f"\nRiepilogo analisi:")
    print(f"  Righe valide         : {len(righe_db)}")
    print(f"  Note di credito      : {nc_count}")
    print(f"  Soggetti non trovati : {len(set(mancanti))}")
    if mancanti:
        for n in sorted(set(mancanti))[:15]:
            print(f"    - {n}")
        if len(set(mancanti)) > 15:
            print(f"    ... e altri {len(set(mancanti)) - 15}")

    if dry_run:
        print("\n🔍 Dry-run: nessuna modifica su Supabase.")
        return

    # 5. Check esistenti (CHECK_CHUNK=50 per limite URL PostgREST)
    print(f"\nInvio {len(righe_db)} righe a Supabase...")
    ids = [r["id"] for r in righe_db]
    esistenti: set[str] = set()
    for i in range(0, len(ids), CHECK_CHUNK):
        res_check = (supabase
                     .table("scadenze_pagamento")
                     .select("id")
                     .in_("id", ids[i:i + CHECK_CHUNK])
                     .execute())
        for row in res_check.data:
            esistenti.add(row["id"])

    nuovi         = [r for r in righe_db if r["id"] not in esistenti]
    da_aggiornare = [r for r in righe_db if r["id"] in esistenti]
    print(f"  Nuovi da inserire      : {len(nuovi)}")
    print(f"  Esistenti da aggiornare: {len(da_aggiornare)}")

    # 6. Insert nuovi
    ins_ok = 0
    for i in range(0, len(nuovi), UPSERT_CHUNK):
        supabase.table("scadenze_pagamento").insert(nuovi[i:i + UPSERT_CHUNK]).execute()
        ins_ok += len(nuovi[i:i + UPSERT_CHUNK])
    print(f"  ✅ Inseriti: {ins_ok}")

    # 7. Update esistenti
    # ⚠️  data_pianificata NON inclusa → preserva le modifiche utente dalla web app
    CAMPI_UPDATE = {
        "importo_totale",
        "importo_pagato",
        "stato",
        "data_pagamento",
        "metodo_pagamento",
        "fattura_riferimento",
        "data_scadenza",
        "data_emissione",
        "soggetto_id",
        "cantiere_id",
        "descrizione",
        "note",
    }
    upd_ok = 0
    for r in da_aggiornare:
        payload = {k: v for k, v in r.items() if k in CAMPI_UPDATE}
        supabase.table("scadenze_pagamento").update(payload).eq("id", r["id"]).execute()
        upd_ok += 1

    print(f"  ✅ Aggiornati: {upd_ok}")
    print(f"\nImportazione completata: {ins_ok} creati, {upd_ok} aggiornati.")


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import pivot cashflow CSV → Supabase")
    parser.add_argument("--dry-run", action="store_true",
                        help="Analizza senza scrivere su Supabase.")
    args = parser.parse_args()
    run_import(dry_run=args.dry_run)
