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
import sys
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


def genera_id(
    soggetto_id: str | None,
    fattura_norm: str,
    importo: float,
    dup_idx: int | None = None,
) -> str:
    """UUID5 deterministico.

    Nota: dup_idx viene valorizzato solo per gruppi duplicati (stessa fattura+importo)
    per evitare il collasso di piani a rate su un unico UUID.
    """
    sid = soggetto_id or "anonimo"
    imp = f"{round(importo, 2):.2f}"
    extra = f"_{dup_idx}" if dup_idx and dup_idx > 1 else ""
    chiave = f"{sid}_{fattura_norm}_{imp}{extra}"
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


def trova_soggetto_best_score(fornitore_nome: str, mappa: dict[str, str]) -> float:
    """Restituisce il miglior score fuzzy (0-1) rispetto all'anagrafica esistente."""
    target = norm(fornitore_nome)
    if not target:
        return 0.0
    if target in mappa:
        return 1.0
    for nome_db in mappa:
        if nome_db in target or target in nome_db:
            return 0.95
    best_score = 0.0
    for nome_db in mappa:
        score = SequenceMatcher(None, target, nome_db).ratio()
        if score > best_score:
            best_score = score
    return best_score


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
        fornitore_raw_val = str(row_get(row, "fornitore", "Fornitore", "FORNITORE") or "").strip()
        righe.append({
            "_fonte": "main",
            "_idx": idx,
            "fornitore": fornitore,
            "fornitore_raw": fornitore_raw_val,
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
    MAIN è la fonte primaria (rate, pagamenti parziali, tutto).
    REPORT XML è supplementare: includi solo fatture NON coperte da MAIN,
    identificate per (fornitore, data_emissione).
    """
    # 1. Costruire indice MAIN: set di (fornitore, data_emissione)
    copertura_main: set[tuple[str, str | None]] = set()
    for r in righe_main:
        copertura_main.add((r["fornitore"], r["data_emissione"]))

    # 2. Partire con TUTTE le righe MAIN
    merged: list[dict[str, Any]] = [{**r, "_fonte": "main"} for r in righe_main]

    # 3. Aggiungere da REPORT XML solo fatture NON coperte da MAIN
    n_skip = 0
    for r in righe_rx:
        chiave_rx = (r["fornitore"], r["data_emissione"])
        if chiave_rx in copertura_main:
            n_skip += 1
            continue  # MAIN copre già questa fattura (anche se con rate diverse)
        merged.append({**r, "_fonte": "report_xml_solo"})

    print(f"  REPORT XML saltate (coperte da MAIN): {n_skip}")
    print(f"  REPORT XML aggiunte (nuove)          : {len(merged) - len(righe_main)}")

    return merged


# ==========================================
# COSTRUZIONE RIGA DB
# ==========================================
def costruisci_riga(
    r: dict[str, Any],
    mappa_soggetti: dict[str, str],
    mappa_cantieri: dict[str, str],
    mancanti_soggetti: list[str],
    mancanti_cantieri: list[str],
    nuovi_soggetti: list[dict] | None = None,
) -> dict[str, Any] | None:
    soggetto_id = trova_soggetto(r["fornitore"], mappa_soggetti)
    if not soggetto_id:
        # Auto-crea anagrafica SOLO se il fornitore è davvero sconosciuto
        # (nessuna somiglianza ragionevole con nomi esistenti, score < 0.55)
        # Evita di creare duplicati per varianti di nome già presenti
        if r.get("_fonte") == "main" and nuovi_soggetti is not None:
            best_score = trova_soggetto_best_score(r["fornitore"], mappa_soggetti)
            if best_score < 0.55:
                from uuid import uuid4
                nuovo_id = str(uuid4())
                ragione_sociale_raw = r.get("fornitore_raw") or r["fornitore"]
                nuovi_soggetti.append({
                    "id": nuovo_id,
                    "ragione_sociale": ragione_sociale_raw,
                    "tipo": "fornitore",
                })
                mappa_soggetti[r["fornitore"]] = nuovo_id
                soggetto_id = nuovo_id
            else:
                mancanti_soggetti.append(r["fornitore"])
                return None
        else:
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
    uuid_id = genera_id(
        soggetto_id,
        r["fattura_norm"],
        importo_totale,
        dup_idx=r.get("_dup_idx"),
    )

    payload: dict[str, Any] = {
        "id": uuid_id,
        "tipo": "uscita",
        "fonte": "excel",
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

    righe_main = leggi_main(xls)
    print(f"\n  MAIN -> {len(righe_main)} righe valide")

    merged = righe_main  # SOLO MAIN, niente REPORT XML
    print(f"  Righe da processare -> {len(merged)}")

    print("\nCostruzione payload DB...")
    mancanti_soggetti: list[str] = []
    mancanti_cantieri: list[str] = []
    nuovi_soggetti: list[dict] = []
    righe_db: list[dict[str, Any]] = []

    # Evita collasso UUID su piani a rate: stessa fattura+importo ripetuti nel MAIN.
    # Applichiamo un indice progressivo SOLO ai gruppi con duplicati.
    from collections import Counter, defaultdict

    dup_counter = Counter(
        (
            r.get("_fonte"),
            r.get("fornitore"),
            r.get("fattura_norm"),
            round(float(r.get("importo_totale") or 0), 2),
        )
        for r in merged
    )
    dup_seen: dict[tuple[Any, ...], int] = defaultdict(int)

    for r in merged:
        dup_key = (
            r.get("_fonte"),
            r.get("fornitore"),
            r.get("fattura_norm"),
            round(float(r.get("importo_totale") or 0), 2),
        )
        if dup_counter[dup_key] > 1:
            dup_seen[dup_key] += 1
            r["_dup_idx"] = dup_seen[dup_key]

        payload = costruisci_riga(r, mappa_soggetti, mappa_cantieri, mancanti_soggetti, mancanti_cantieri, nuovi_soggetti)
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
    print(f"  Nuovi soggetti     : {len(nuovi_soggetti)}")
    print(f"  Soggetti mancanti  : {len(set(mancanti_soggetti))}")
    print(f"  Cantieri mancanti  : {len(set(mancanti_cantieri))}")
    print(f"  Fonti merged:")
    for fonte, n in sorted(fonti.items()):
        print(f"    {fonte:<14} : {n}")
    print(f"  Distribuzione stati:")
    for stato, n in sorted(stati.items()):
        print(f"    {stato:<12} : {n}")

    if nuovi_soggetti:
        print(f"\nAnagrafiche da creare automaticamente ({len(nuovi_soggetti)}):")
        for s in nuovi_soggetti:
            print(f"  + {s['ragione_sociale']}")

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

    # Crea le nuove anagrafiche prima dell'upsert scadenze
    if nuovi_soggetti:
        print(f"\nCreazione {len(nuovi_soggetti)} nuove anagrafiche...")
        for s in nuovi_soggetti:
            try:
                supabase.table("anagrafica_soggetti").insert(s).execute()
                print(f"  ✅ {s['ragione_sociale']}")
            except Exception as e:
                print(f"  ❌ {s['ragione_sociale']}: {e}")

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

    nuovi_raw = [r for r in righe_db if r["id"] not in esistenti]
    da_aggiornare = [r for r in righe_db if r["id"] in esistenti]
    print(f"  Nuovi (UUID non trovato): {len(nuovi_raw)}")
    print(f"  Esistenti da aggiornare : {len(da_aggiornare)}")

    # ── SECONDARY DEDUP ──────────────────────────────────────────────────────
    # UUID5 usa soggetto_id: se il fuzzy matching cambia soggetto_id tra run,
    # lo stesso UUID5 cambia → lo script creerebbe un duplicato (INSERT).
    # Qui cerchiamo record con stessa (soggetto_id, fattura_riferimento, data_emissione,
    # importo_totale, fonte='excel') già presenti sotto un UUID diverso.
    # Se trovati → UPDATE il record esistente, non INSERT.
    nuovi: list[dict] = []
    redirect_update: list[dict] = []  # nuovi che in realtà esistono sotto altro UUID

    if nuovi_raw:
        # Fetch tutti gli ID excel esistenti con i campi di matching
        excel_esistenti: list[dict] = []
        offset2 = 0
        while True:
            res_ex = supabase.table("scadenze_pagamento") \
                .select("id, soggetto_id, fattura_riferimento, data_emissione, importo_totale") \
                .eq("tipo", "uscita") \
                .eq("fonte", "excel") \
                .range(offset2, offset2 + 999) \
                .execute()
            excel_esistenti.extend(res_ex.data)
            if len(res_ex.data) < 1000:
                break
            offset2 += 1000

        # Indice: (soggetto_id, fattura_rif, data_emissione, importo) → id_esistente
        idx_excel = {}
        for ex in excel_esistenti:
            k = (
                ex.get("soggetto_id"),
                ex.get("fattura_riferimento"),
                ex.get("data_emissione"),
                round(float(ex.get("importo_totale") or 0), 2),
            )
            idx_excel[k] = ex["id"]

        for r in nuovi_raw:
            k = (
                r.get("soggetto_id"),
                r.get("fattura_riferimento"),
                r.get("data_emissione"),
                round(float(r.get("importo_totale") or 0), 2),
            )
            if k in idx_excel:
                # Record esiste sotto UUID diverso → reindirizza ad UPDATE
                r_update = {**r, "id": idx_excel[k]}
                redirect_update.append(r_update)
            else:
                nuovi.append(r)

        if redirect_update:
            print(f"  UUID instabili corretti  : {len(redirect_update)} (UPDATE su UUID esistente)")
        da_aggiornare.extend(redirect_update)

    print(f"  Effettivamente nuovi     : {len(nuovi)}")
    # ─────────────────────────────────────────────────────────────────────────

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

    # ─────────────────────────────────────────────────────────
    # RICONCILIAZIONE SAFE: solo report, nessuna cancellazione
    # automatica. Usa --purge per cancellare manualmente.
    # ─────────────────────────────────────────────────────────
    ids_attesi = set(r["id"] for r in righe_db)
    print(f"\nRiconciliazione uscite (modalità safe)...")

    ids_db: set[str] = set()
    PAGE_SIZE = 1000
    offset = 0
    while True:
        res_page = (
            supabase.table("scadenze_pagamento")
            .select("id")
            .eq("tipo", "uscita")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        for row in res_page.data:
            ids_db.add(row["id"])
        if len(res_page.data) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    print(f"  Uscite totali nel DB: {len(ids_db)}")

    ids_orfane = ids_db - ids_attesi
    if ids_orfane:
        print(f"\n⚠️  {len(ids_orfane)} scadenze uscita nel DB non presenti in Excel (NON eliminate)")
        print(f"     Per eliminarle manualmente, usa --purge")

        if "--purge" in sys.argv:
            # Soglia di sicurezza: se > 20% verrebbe cancellato, abortire
            if len(ids_orfane) > len(ids_db) * 0.2:
                print(f"❌ ABORT: cancellazione di {len(ids_orfane)}/{len(ids_db)} scadenze (>{20}%). Possibile errore nei dati Excel.")
                return

            ids_da_eliminare = set(ids_orfane)

            # FK guard 1: escludere ID referenziati in fatture_vendita.scadenza_id
            fv_res = (
                supabase.table("fatture_vendita")
                .select("scadenza_id")
                .not_.is_("scadenza_id", "null")
                .execute()
            )
            ids_fk_protetti = set(r["scadenza_id"] for r in fv_res.data if r.get("scadenza_id"))
            ids_da_eliminare -= ids_fk_protetti
            if ids_fk_protetti:
                print(f"  Protetti da FK (fatture_vendita): {len(ids_fk_protetti)}")

            # FK guard 2: escludere ID referenziati in titoli.scadenza_id
            titoli_res = (
                supabase.table("titoli")
                .select("scadenza_id")
                .not_.is_("scadenza_id", "null")
                .execute()
            )
            ids_titoli_protetti = set(r["scadenza_id"] for r in titoli_res.data if r.get("scadenza_id"))
            ids_da_eliminare -= ids_titoli_protetti
            if ids_titoli_protetti:
                print(f"  Protetti da FK (titoli): {len(ids_titoli_protetti)}")

            # Proteggere scadenze da fonti non-Excel
            non_excel_res = (
                supabase.table("scadenze_pagamento")
                .select("id")
                .in_("fonte", ["fattura", "manuale", "titolo", "verificato", "mutuo"])
                .in_("id", list(ids_da_eliminare)[:1000] if ids_da_eliminare else ["x"])
                .execute()
            )
            ids_non_excel = set(r["id"] for r in non_excel_res.data)
            ids_da_eliminare -= ids_non_excel
            if ids_non_excel:
                print(f"  Protetti (fonte non-Excel): {len(ids_non_excel)}")

            print(f"  Scadenze da eliminare (con --purge): {len(ids_da_eliminare)}")
            lista_da_eliminare = list(ids_da_eliminare)
            DEL_CHUNK = 50
            for i in range(0, len(lista_da_eliminare), DEL_CHUNK):
                chunk = lista_da_eliminare[i : i + DEL_CHUNK]
                supabase.table("scadenze_pagamento").delete().in_("id", chunk).execute()
            print(f"  ✅ Eliminate {len(ids_da_eliminare)} scadenze obsolete")
        else:
            print(f"     Nessuna cancellazione eseguita (modalità safe)")
    else:
        print(f"  ✅ Nessuna scadenza orfana trovata")


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
