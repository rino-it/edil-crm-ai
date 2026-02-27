# coding: utf-8
"""
sync_excel_supabase.py  -  v2

Motore di sincronizzazione "cieco ma infallibile" Excel -> Supabase.

Fonte verita:
  - Foglio REPORT XML  -> debito lordo (tutte le fatture ricevute)
  - Foglio MAIN        -> cassa pagamenti (stato saldi, date, metodi)

Logica:
  - UUID5 deterministico: stessa fattura = stesso ID -> upsert idempotente
  - MAIN vince su REPORT XML per i dati di pagamento
  - NON sovrascrive data_pianificata (modificata dall'utente nella web app)
  - NON tocca entrate, anagrafiche, cantieri, conti banca
"""
import argparse
import os
import re
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_OID, uuid5

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

# ==========================================
# CONFIGURAZIONE
# ==========================================
PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

FILE_EXCEL = os.getenv(
    "SYNC_EXCEL_FILE",
    "\\\\192.168.1.231\\scambio\\AMMINISTRAZIONE\\Clienti e Fornitori\\2025\\contabilità\\EV - AMMINISTRAZIONE.xlsx",
)
FOGLIO_REPORT_XML = os.getenv("SYNC_SHEET_REPORT", "REPORT XML")
FOGLIO_MAIN = os.getenv("SYNC_SHEET_MAIN", "MAIN")
CHUNK_SIZE = int(os.getenv("SYNC_CHUNK_SIZE", "500"))
OGGI = date.today().isoformat()


# ==========================================
# HELPERS
# ==========================================
def norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in ("nan", "none", "") else " ".join(text.lower().split())


def norm_invoice(value: Any) -> str:
    """Normalizza numero fattura: solo alfanumerici lowercase."""
    return re.sub(r"[^a-z0-9]", "", norm(value))


def get_float(val: Any) -> float:
    try:
        if pd.isna(val):
            return 0.0
    except TypeError:
        pass
    if isinstance(val, (int, float)):
        v = float(val)
        return 0.0 if v != v else v  # NaN check
    text = str(val).strip().replace("\u20ac", "").replace(" ", "").replace("\xa0", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def get_date(val: Any) -> str | None:
    try:
        if pd.isna(val) or str(val).strip() in ("", "nan", "NaT"):
            return None
    except TypeError:
        pass
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.isoformat()
    try:
        return pd.to_datetime(val, dayfirst=True).strftime("%Y-%m-%d")
    except Exception:
        return None


def row_get(row: pd.Series, *keys: str) -> Any:
    """Ritorna il primo valore non-null tra le chiavi elencate."""
    for k in keys:
        if k in row.index:
            v = row[k]
            if v is not None and not (isinstance(v, float) and pd.isna(v)):
                s = str(v).strip()
                if s and s.lower() not in ("nan", "none"):
                    return v
    return None


def is_saldato(val: Any) -> bool:
    """True se la colonna Sdo/S.do è compilata (= pagato).
    Accetta: 'x', '✓', 'si/sì/yes/1/true' oppure qualsiasi numero non-zero.
    """
    if val is None:
        return False
    # Valore NaN di pandas
    try:
        import math
        if math.isnan(float(val)):
            return False
    except (TypeError, ValueError):
        pass
    s = str(val).strip().lower()
    if s in ("", "nan", "none", "0", "0.0"):
        return False
    # Marcatori testuali espliciti
    if s in ("x", "\u2713", "si", "s\u00ec", "yes", "true"):
        return True
    # Valore numerico non-zero (es. importo saldato come 1500.00)
    try:
        return float(s) != 0
    except ValueError:
        pass
    # Qualsiasi altra stringa non vuota = compilata = saldato
    return True


def genera_id(soggetto_id: str | None, fattura_norm: str, importo: float) -> str:
    """UUID5 deterministico: stessa chiave -> stesso UUID sempre."""
    sid = soggetto_id or "anonimo"
    imp = f"{round(importo, 2):.2f}"
    chiave = f"{sid}_{fattura_norm}_{imp}"
    return str(uuid5(NAMESPACE_OID, chiave))


def trova_soggetto(fornitore_nome: str, mappa: dict[str, str]) -> str | None:
    """Match fornitore 3 livelli: esatto -> contains -> fuzzy >=0.88."""
    target = norm(fornitore_nome)
    if not target:
        return None
    if target in mappa:
        return mappa[target]
    for nome_db, sid in mappa.items():
        if nome_db in target or target in nome_db:
            return sid
    best_score, best_id = 0.0, None
    for nome_db, sid in mappa.items():
        score = SequenceMatcher(None, target, nome_db).ratio()
        if score > best_score:
            best_score, best_id = score, sid
    return best_id if best_score >= 0.88 else None


def trova_cantiere(cantiere_nome: str, mappa_cantieri: dict[str, str]) -> str | None:
    """Match cantiere 3 livelli: esatto -> contains -> fuzzy >=0.85."""
    target = norm(cantiere_nome)
    if not target:
        return None
    if target in mappa_cantieri:
        return mappa_cantieri[target]
    for nome_db, cid in mappa_cantieri.items():
        if nome_db in target or target in nome_db:
            return cid
    best_score, best_id = 0.0, None
    for nome_db, cid in mappa_cantieri.items():
        score = SequenceMatcher(None, target, nome_db).ratio()
        if score > best_score:
            best_score, best_id = score, cid
    return best_id if best_score >= 0.85 else None


def calcola_stato(
    sdo: bool, importo_pagato: float, importo_totale: float, data_scadenza: str | None
) -> str:
    if sdo:
        return "pagato"
    if importo_totale > 0 and importo_pagato >= importo_totale - 0.02:
        return "pagato"
    if importo_pagato > 0:
        return "parziale"
    if data_scadenza and data_scadenza < OGGI:
        return "scaduto"
    return "da_pagare"


# ==========================================
# LETTURA FOGLI EXCEL
# ==========================================
def leggi_report_xml(xls: pd.ExcelFile) -> list[dict[str, Any]]:
    """Legge foglio REPORT XML -> lista dict normalizzati."""
    righe: list[dict[str, Any]] = []
    try:
        df = pd.read_excel(xls, sheet_name=FOGLIO_REPORT_XML)
    except Exception as e:
        print(f"  Foglio '{FOGLIO_REPORT_XML}' non trovato: {e}")
        return righe
    df.columns = [str(c).strip() for c in df.columns]
    for idx, row in df.iterrows():
        fornitore = norm(row_get(row, "Fornitore", "FORNITORE", "fornitore"))
        if not fornitore:
            continue
        importo = get_float(row_get(row, "Importo", "IMPORTO", "importo"))
        if importo == 0:
            continue
        fattura_raw = row_get(row, "Fattura", "FATTURA", "fattura", "fattura nr")
        fattura_norm = norm_invoice(fattura_raw)
        if not fattura_norm:
            fattura_norm = f"spesa_{re.sub(chr(91) + chr(94) + 'a-z0-9' + chr(93), '', fornitore)}_{idx}"
        # SKIP: non importare fatture già pagate (S.do compilato)
        sdo = is_saldato(row_get(row, "S.do", "Sdo", "SDO", "saldo", "Saldo"))
        if sdo:
            continue
        righe.append({
            "_fonte": "report_xml",
            "_idx": idx,
            "fornitore": fornitore,
            "fattura_raw": str(fattura_raw).strip() if fattura_raw else fattura_norm,
            "fattura_norm": fattura_norm,
            "importo_totale": importo,
            "data_emissione": get_date(row_get(row, "Data", "DATA", "data emissione")),
            "data_scadenza": get_date(row_get(row, "Scadenza", "SCADENZA")),
            "sdo": sdo,
            "importo_pagato": get_float(row_get(row, "Importo pag.", "Importo pagamento", "IMPORTO PAG")),
            "data_pagamento": get_date(row_get(row, "Data Pag.", "Data pagamento", "DATA PAG")),
            "metodo": norm(row_get(row, "Mod.Pag", "Mod. Pag", "Modalita pagamento") or ""),
            "cantiere": norm(row_get(row, "Cantiere", "CANTIERE") or ""),
            "note": None,
        })
    return righe


def leggi_main(xls: pd.ExcelFile) -> list[dict[str, Any]]:
    """Legge foglio MAIN -> lista dict normalizzati."""
    righe: list[dict[str, Any]] = []
    try:
        df = pd.read_excel(xls, sheet_name=FOGLIO_MAIN)
    except Exception as e:
        print(f"  Foglio '{FOGLIO_MAIN}' non trovato: {e}")
        return righe
    df.columns = [str(c).strip() for c in df.columns]
    for idx, row in df.iterrows():
        fornitore = norm(row_get(row, "fornitore", "Fornitore", "FORNITORE"))
        if not fornitore:
            continue
        importo = get_float(row_get(row, "Importo", "IMPORTO"))
        if importo == 0:
            continue
        fattura_raw = row_get(row, "fattura nr", "Fattura nr", "fattura", "Fattura", "FATTURA")
        fattura_norm = norm_invoice(fattura_raw)
        if not fattura_norm:
            fattura_norm = f"spesa_{re.sub(chr(91) + chr(94) + 'a-z0-9' + chr(93), '', fornitore)}_{idx}"
        note_val = row_get(row, "NOTE", "Note")
        righe.append({
            "_fonte": "main",
            "_idx": idx,
            "fornitore": fornitore,
            "fattura_raw": str(fattura_raw).strip() if fattura_raw else fattura_norm,
            "fattura_norm": fattura_norm,
            "importo_totale": importo,
            "data_emissione": get_date(row_get(row, "del", "Del", "Data emissione", "DATA EMISSIONE")),
            "data_scadenza": get_date(row_get(row, "Scadenza", "SCADENZA")),
            "sdo": is_saldato(row_get(row, "Sdo", "SDO", "S.do")),
            "importo_pagato": get_float(row_get(row, "Importo pagamento", "IMPORTO PAGAMENTO")),
            "data_pagamento": get_date(row_get(row, "Data pagamento", "DATA PAGAMENTO")),
            "metodo": norm(row_get(row, "Modalit\u00e0\npagamento", "Modalit\u00e0 pagamento", "Modalita pagamento", "METODO") or ""),
            "cantiere": norm(row_get(row, "Cantiere", "CANTIERE") or ""),
            "note": str(note_val).strip() if note_val and str(note_val).strip() not in ("nan", "None") else None,
        })
    return righe


# ==========================================
# MERGE
# ==========================================
def merge_fogli(
    righe_rx: list[dict[str, Any]],
    righe_main: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Unisce REPORT XML e MAIN.
    Chiave: fornitore + fattura_norm + importo arrotondato.
    MAIN vince per dati di pagamento.
    """
    def chiave(r: dict) -> tuple:
        return (r["fornitore"], r["fattura_norm"], round(r["importo_totale"], 2))

    idx_main: dict[tuple, dict[str, Any]] = {}
    for r in righe_main:
        idx_main[chiave(r)] = r

    merged: dict[tuple, dict[str, Any]] = {}

    for r in righe_rx:
        k = chiave(r)
        main_row = idx_main.get(k)
        if main_row:
            r = {
                **r,
                "sdo": main_row["sdo"] or r["sdo"],
                "importo_pagato": main_row["importo_pagato"] or r["importo_pagato"],
                "data_pagamento": main_row["data_pagamento"] or r["data_pagamento"],
                "metodo": main_row["metodo"] or r["metodo"],
                "cantiere": main_row["cantiere"] or r["cantiere"],
                "note": main_row["note"] or r["note"],
                "data_scadenza": r["data_scadenza"] or main_row["data_scadenza"],
                "_fonte": "merge",
            }
        merged[k] = r

    for r in righe_main:
        k = chiave(r)
        if k not in merged:
            merged[k] = {**r, "_fonte": "main_solo"}

    return list(merged.values())


# ==========================================
# COSTRUZIONE RIGA DB
# ==========================================
def costruisci_riga(
    r: dict[str, Any],
    mappa_soggetti: dict[str, str],
    mappa_cantieri: dict[str, str],
    mancanti_soggetti: list[str],
    mancanti_cantieri: list[str],
) -> dict[str, Any] | None:
    soggetto_id = trova_soggetto(r["fornitore"], mappa_soggetti)
    if not soggetto_id:
        mancanti_soggetti.append(r["fornitore"])
        return None

    cantiere_id = trova_cantiere(r["cantiere"], mappa_cantieri) if r["cantiere"] else None
    if r["cantiere"] and not cantiere_id:
        mancanti_cantieri.append(r["cantiere"])

    importo_totale = r["importo_totale"]
    importo_pagato = r["importo_pagato"]
    sdo = r["sdo"]
    if sdo and importo_pagato == 0:
        importo_pagato = importo_totale

    # Fallback data_scadenza: scadenza -> emissione -> oggi (NOT NULL in DB)
    data_scad = r["data_scadenza"] or r["data_emissione"] or OGGI

    stato = calcola_stato(sdo, importo_pagato, importo_totale, data_scad)
    uuid_id = genera_id(soggetto_id, r["fattura_norm"], importo_totale)

    payload: dict[str, Any] = {
        "id": uuid_id,
        "tipo": "uscita",
        "soggetto_id": soggetto_id,
        "fattura_riferimento": r["fattura_raw"],
        "importo_totale": importo_totale,
        "importo_pagato": importo_pagato,
        "data_emissione": r["data_emissione"],
        "data_scadenza": data_scad,
        "data_pianificata": data_scad,  # solo per INSERT - non sovrascritta nell'update
        "data_pagamento": r["data_pagamento"],
        "stato": stato,
        "metodo_pagamento": r["metodo"] or None,
        "note": r["note"],
    }
    if cantiere_id:
        payload["cantiere_id"] = cantiere_id
    return payload


# ==========================================
# MAIN
# ==========================================
def run_sync(dry_run: bool = False) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Variabili mancanti: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    if not os.path.exists(FILE_EXCEL):
        raise FileNotFoundError(f"File Excel non trovato: {FILE_EXCEL}")

    print("=" * 60)
    print("  SYNC EXCEL -> SUPABASE  v2")
    print("=" * 60)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Lettura anagrafiche da Supabase...")
    res = supabase.table("anagrafica_soggetti").select("id, ragione_sociale").execute()
    mappa_soggetti = {norm(s["ragione_sociale"]): s["id"] for s in res.data}
    print(f"  -> {len(mappa_soggetti)} soggetti caricati")

    print("Lettura cantieri da Supabase...")
    res_c = supabase.table("cantieri").select("id, nome, codice").execute()
    mappa_cantieri: dict[str, str] = {}
    for c in res_c.data:
        if c.get("nome"):
            mappa_cantieri[norm(c["nome"])] = c["id"]
        if c.get("codice"):
            mappa_cantieri[norm(c["codice"])] = c["id"]
    print(f"  -> {len(res_c.data)} cantieri caricati")

    print(f"\nLettura Excel: {FILE_EXCEL}")
    xls = pd.ExcelFile(FILE_EXCEL)
    print(f"  Fogli disponibili: {xls.sheet_names}")

    righe_rx = leggi_report_xml(xls)
    righe_main = leggi_main(xls)
    print(f"\n  REPORT XML -> {len(righe_rx)} righe valide")
    print(f"  MAIN       -> {len(righe_main)} righe valide")

    merged = merge_fogli(righe_rx, righe_main)
    print(f"  Dopo merge -> {len(merged)} righe uniche")

    print("\nCostruzione payload DB...")
    mancanti_soggetti: list[str] = []
    mancanti_cantieri: list[str] = []
    righe_db: list[dict[str, Any]] = []

    for r in merged:
        payload = costruisci_riga(r, mappa_soggetti, mappa_cantieri, mancanti_soggetti, mancanti_cantieri)
        if payload:
            righe_db.append(payload)

    stati: dict[str, int] = {}
    for r in righe_db:
        stati[r["stato"]] = stati.get(r["stato"], 0) + 1
    fonti: dict[str, int] = {}
    for r in merged:
        fonti[r["_fonte"]] = fonti.get(r["_fonte"], 0) + 1

    print(f"\nRiepilogo:")
    print(f"  Righe da inviare   : {len(righe_db)}")
    print(f"  Soggetti mancanti  : {len(set(mancanti_soggetti))}")
    print(f"  Cantieri mancanti  : {len(set(mancanti_cantieri))}")
    print(f"  Fonti merged:")
    for fonte, n in sorted(fonti.items()):
        print(f"    {fonte:<14} : {n}")
    print(f"  Distribuzione stati:")
    for stato, n in sorted(stati.items()):
        print(f"    {stato:<12} : {n}")

    if mancanti_soggetti:
        uniq = sorted(set(mancanti_soggetti))
        print(f"\nFornitori non trovati in anagrafica ({len(uniq)} unici):")
        for nome in uniq[:20]:
            print(f"  - {nome}")
        if len(uniq) > 20:
            print(f"  ... e altri {len(uniq) - 20}")

    if dry_run:
        print("\nDry-run attivo: nessuna modifica su Supabase.")
        return

    print(f"\nInvio {len(righe_db)} righe a Supabase...")

    # Dedup UUID nel batch: se due fornitore diversi → stesso soggetto_id via fuzzy
    # → stesso UUID → teniamo solo l'ultimo (MAIN vince già nel merge)
    righe_db_dedup: dict[str, dict] = {}
    for r in righe_db:
        righe_db_dedup[r["id"]] = r
    righe_db = list(righe_db_dedup.values())
    print(f"  Dopo dedup UUID        : {len(righe_db)} righe uniche")

    ids_da_inviare = [r["id"] for r in righe_db]
    esistenti: set[str] = set()
    # CHECK_CHUNK piccolo (50) per restare sotto il limite URL di PostgREST (~8KB)
    # Con 500 UUID × 36 char = ~19KB → request troncata silenziosamente
    CHECK_CHUNK = 50
    for i in range(0, len(ids_da_inviare), CHECK_CHUNK):
        chunk_ids = ids_da_inviare[i : i + CHECK_CHUNK]
        res_check = (
            supabase.table("scadenze_pagamento")
            .select("id")
            .in_("id", chunk_ids)
            .execute()
        )
        for row in res_check.data:
            esistenti.add(row["id"])

    nuovi = [r for r in righe_db if r["id"] not in esistenti]
    da_aggiornare = [r for r in righe_db if r["id"] in esistenti]
    print(f"  Nuovi da inserire      : {len(nuovi)}")
    print(f"  Esistenti da aggiornare: {len(da_aggiornare)}")

    if nuovi:
        for i in range(0, len(nuovi), CHUNK_SIZE):
            supabase.table("scadenze_pagamento").insert(nuovi[i : i + CHUNK_SIZE]).execute()

    CAMPI_UPDATE = {
        "importo_pagato", "stato", "data_pagamento", "metodo_pagamento",
        "importo_totale", "data_scadenza", "data_emissione", "note",
        "cantiere_id", "soggetto_id", "fattura_riferimento",
    }
    if da_aggiornare:
        for r in da_aggiornare:
            payload_update = {k: v for k, v in r.items() if k in CAMPI_UPDATE}
            (
                supabase.table("scadenze_pagamento")
                .update(payload_update)
                .eq("id", r["id"])
                .execute()
            )

    print(f"\nSincronizzazione completata.")
    print(f"  - {len(nuovi)} nuove scadenze create")
    print(f"  - {len(da_aggiornare)} scadenze aggiornate (saldi)")


# ==========================================
# CLI
# ==========================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync Excel (REPORT XML + MAIN) -> Supabase  -  v2"
    )
    parser.add_argument("--dry-run", action="store_true", help="Analizza senza scrivere su Supabase.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_sync(dry_run=args.dry_run)
