# coding: utf-8
"""
import_pivot_cashflow.py — Importa storico da CSV Pivot in scadenze_pagamento

Pattern: UUID5 deterministico per idempotenza (ri-eseguibile senza duplicati)
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
CSV_PATH = r"\\192.168.1.231\scambio\AMMINISTRAZIONE\pivot_cashflow.csv"  # ← DA CONFERMARE
CHECK_CHUNK = 50   # Supabase PostgREST URL limit (~8KB per GET)
UPSERT_CHUNK = 100

OGGI = date.today().isoformat()

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def norm(s: str) -> str:
    """Normalizza stringa: lowercase, strip, collassa spazi."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def norm_invoice(s) -> str:
    """Normalizza numero fattura: rimuove caratteri non alfanumerici."""
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]", "", norm(str(s)))


def get_float(s) -> float:
    """Converte stringa importo → float (gestisce . e , come separatori)."""
    if s is None:
        return 0.0
    try:
        cleaned = str(s).strip().replace(".", "").replace(",", ".")
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0


def get_date(s) -> str | None:
    """Prova a parsare una data in vari formati → ISO string o None."""
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def genera_id(soggetto_id: str | None, fattura_norm: str, importo: float) -> str:
    """UUID5 deterministico — stessa fattura = stesso ID sempre."""
    sid = soggetto_id or "anonimo"
    imp = f"{round(importo, 2):.2f}"
    return str(uuid5(NAMESPACE_OID, f"{sid}|{fattura_norm}|{imp}"))


def match_soggetto(nome_csv: str, dizionario: dict[str, str]) -> str | None:
    """Fuzzy match contro anagrafica_soggetti (soglia 85)."""
    try:
        from thefuzz import process
    except ImportError:
        return dizionario.get(norm(nome_csv).upper())
    nome_pulito = norm(nome_csv).upper()
    if not nome_pulito:
        return None
    risultato = process.extractOne(nome_pulito, list(dizionario.keys()), score_cutoff=85)
    if risultato:
        return dizionario[risultato[0]]
    return None


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
    print(f"  -> {len(dizionario_nomi)} soggetti caricati")

    # 2. Leggi CSV
    print(f"\nLettura CSV: {CSV_PATH}")
    righe_raw: list[dict] = []
    try:
        with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                righe_raw.append(dict(row))
    except FileNotFoundError:
        print(f"  ❌ File non trovato: {CSV_PATH}")
        print("  Aggiorna CSV_PATH nella riga 23 con il percorso corretto.")
        return
    print(f"  -> {len(righe_raw)} righe lette")

    if righe_raw:
        print(f"  Colonne rilevate: {list(righe_raw[0].keys())}")
        print(f"  Prima riga: {righe_raw[0]}")

    # ─── ⚠️ ADATTA QUI LE COLONNE ───────────────────────────────────────────
    # Sostituisci i nomi-chiave con le intestazioni reali del tuo CSV.
    # Esempi comuni: "Fornitore", "Nr. Fattura", "Data", "Scadenza", "Importo", "Pagato"
    COL_FORNITORE   = "Fornitore"        # ← DA CONFERMARE
    COL_FATTURA     = "Nr. Fattura"      # ← DA CONFERMARE
    COL_DATA_EMI    = "Data"             # ← DA CONFERMARE
    COL_DATA_SCAD   = "Scadenza"         # ← DA CONFERMARE
    COL_IMPORTO     = "Importo"          # ← DA CONFERMARE
    COL_PAGATO      = "Pagato"           # ← DA CONFERMARE (importo già pagato)
    COL_TIPO        = None               # ← Se presente: colonna che indica entrata/uscita
    TIPO_DEFAULT    = "uscita"           # ← Tipo di default se COL_TIPO è None
    # ────────────────────────────────────────────────────────────────────────

    # 3. Costruisci payload
    print("\nCostruzione payload DB...")
    righe_db: list[dict] = []
    mancanti: list[str] = []

    for idx, row in enumerate(righe_raw):
        fornitore_raw = row.get(COL_FORNITORE, "").strip()
        if not fornitore_raw:
            continue

        importo = get_float(row.get(COL_IMPORTO, 0))
        if importo <= 0:
            continue

        fattura_raw = row.get(COL_FATTURA, "")
        fattura_norm = norm_invoice(fattura_raw)
        if not fattura_norm:
            fattura_norm = f"pivot_{norm(fornitore_raw).replace(' ', '_')}_{idx}"

        data_emissione = get_date(row.get(COL_DATA_EMI, ""))
        data_scadenza  = get_date(row.get(COL_DATA_SCAD, "")) or data_emissione or OGGI
        importo_pagato = get_float(row.get(COL_PAGATO, 0))

        tipo = norm(row.get(COL_TIPO, "")) if COL_TIPO else TIPO_DEFAULT
        if tipo not in ("entrata", "uscita"):
            tipo = TIPO_DEFAULT

        residuo = importo - importo_pagato
        if residuo > 0 and data_scadenza < OGGI:
            stato = "scaduto"
        elif residuo <= 0:
            stato = "pagato"
        else:
            stato = "da_pagare"

        soggetto_id = match_soggetto(fornitore_raw, dizionario_nomi)
        if not soggetto_id:
            mancanti.append(fornitore_raw)
            continue

        uuid_id = genera_id(soggetto_id, fattura_norm, importo)

        righe_db.append({
            "id": uuid_id,
            "soggetto_id": soggetto_id,
            "tipo": tipo,
            "fattura_riferimento": str(fattura_raw).strip() or fattura_norm,
            "importo_totale": importo,
            "importo_pagato": importo_pagato,
            "data_emissione": data_emissione,
            "data_scadenza": data_scadenza,
            "data_pianificata": data_scadenza,
            "stato": stato,
            "note": "import_pivot_cashflow",
        })

    # Dedup UUID
    dedup: dict[str, dict] = {}
    for r in righe_db:
        dedup[r["id"]] = r
    righe_db = list(dedup.values())

    print(f"\nRiepilogo:")
    print(f"  Righe da inviare  : {len(righe_db)}")
    print(f"  Soggetti mancanti : {len(set(mancanti))}")

    if mancanti:
        for nome in sorted(set(mancanti))[:20]:
            print(f"    - {nome}")
        if len(set(mancanti)) > 20:
            print(f"    ... e altri {len(set(mancanti)) - 20}")

    if dry_run:
        print("\nDry-run attivo: nessuna modifica su Supabase.")
        return

    # 4. Upsert a Supabase
    print(f"\nInvio {len(righe_db)} righe a Supabase...")

    ids = [r["id"] for r in righe_db]
    esistenti: set[str] = set()
    for i in range(0, len(ids), CHECK_CHUNK):
        res_check = supabase.table("scadenze_pagamento").select("id").in_("id", ids[i:i+CHECK_CHUNK]).execute()
        for row in res_check.data:
            esistenti.add(row["id"])

    nuovi = [r for r in righe_db if r["id"] not in esistenti]
    da_aggiornare = [r for r in righe_db if r["id"] in esistenti]
    print(f"  Nuovi da inserire      : {len(nuovi)}")
    print(f"  Esistenti da aggiornare: {len(da_aggiornare)}")

    for i in range(0, len(nuovi), UPSERT_CHUNK):
        supabase.table("scadenze_pagamento").insert(nuovi[i:i+UPSERT_CHUNK]).execute()

    CAMPI_UPDATE = {"importo_pagato", "stato", "importo_totale", "data_scadenza", "data_emissione", "soggetto_id", "fattura_riferimento"}
    for r in da_aggiornare:
        payload = {k: v for k, v in r.items() if k in CAMPI_UPDATE}
        supabase.table("scadenze_pagamento").update(payload).eq("id", r["id"]).execute()

    print(f"\nImportazione completata.")
    print(f"  - {len(nuovi)} record creati")
    print(f"  - {len(da_aggiornare)} record aggiornati")


# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import pivot cashflow CSV → Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Analizza senza scrivere su Supabase.")
    args = parser.parse_args()
    run_import(dry_run=args.dry_run)
