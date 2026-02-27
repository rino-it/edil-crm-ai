import argparse
import os
from datetime import datetime
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client


# ==========================================
# CONFIGURAZIONE
# ==========================================
load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

FILE_EXCEL = os.getenv(
    "SYNC_EXCEL_FILE",
    r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\EV - AMMINISTRAZIONE.xlsx",
)
NOME_FOGLIO = os.getenv("SYNC_EXCEL_SHEET", "MAIN")
CHUNK_SIZE = int(os.getenv("SYNC_CHUNK_SIZE", "500"))


# ==========================================
# HELPERS
# ==========================================
def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return " ".join(text.lower().split())


def pulisci_importo(value: Any) -> float:
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return 0.0

    text = text.replace("€", "").replace(" ", "")

    # Gestione robusta: 1.234,56 / 1,234.56 / 1234,56 / 1234.56
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


def converti_data(value: Any) -> str | None:
    if pd.isna(value) or str(value).strip() == "":
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    try:
        return pd.to_datetime(value, dayfirst=True).strftime("%Y-%m-%d")
    except Exception:
        return None


def trova_soggetto_id(fornitore_nome: str, mappa_soggetti: dict[str, str]) -> str | None:
    nome_norm = normalize_text(fornitore_nome)
    if not nome_norm:
        return None

    # 1) match esatto normalizzato
    if nome_norm in mappa_soggetti:
        return mappa_soggetti[nome_norm]

    # 2) contains bidirezionale
    for nome_db, soggetto_id in mappa_soggetti.items():
        if nome_db in nome_norm or nome_norm in nome_db:
            return soggetto_id

    return None


# ==========================================
# MAIN
# ==========================================
def run_sync(mirror_mode: bool = True, dry_run: bool = False) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "Variabili mancanti: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
        )

    if not os.path.exists(FILE_EXCEL):
        raise FileNotFoundError(f"File Excel non trovato: {FILE_EXCEL}")

    print("🔄 Avvio sincronizzazione EXCEL -> SUPABASE...")

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("📥 Lettura anagrafiche da Supabase...")
    risposta_soggetti = (
        supabase.table("anagrafica_soggetti").select("id, ragione_sociale").execute()
    )
    mappa_soggetti = {
        normalize_text(s.get("ragione_sociale")): s.get("id") for s in risposta_soggetti.data
    }

    print(f"📖 Lettura file Excel: {FILE_EXCEL} (Foglio: {NOME_FOGLIO})")
    df = pd.read_excel(FILE_EXCEL, sheet_name=NOME_FOGLIO)
    df.columns = [str(c).strip() for c in df.columns]

    records_to_upsert: list[dict[str, Any]] = []
    skipped_missing_key = 0

    for _, row in df.iterrows():
        fornitore_nome = str(row.get("fornitore", "")).strip()
        if not fornitore_nome or pd.isna(fornitore_nome):
            continue

        fattura_nr = str(row.get("fattura nr", "")).strip()
        data_scadenza = converti_data(row.get("Scadenza"))

        # Chiavi minime per sincronizzazione affidabile
        if not fattura_nr or not data_scadenza:
            skipped_missing_key += 1
            continue

        soggetto_id = trova_soggetto_id(fornitore_nome, mappa_soggetti)

        importo_totale = pulisci_importo(row.get("Importo"))
        importo_pagato = pulisci_importo(row.get("Importo pagamento"))
        data_pagamento = converti_data(row.get("Data pagamento"))
        data_emissione = converti_data(row.get("del"))

        appunti = str(row.get("APPUNTI", "")).strip().upper()
        stato = "da_pagare"
        if importo_totale > 0 and importo_pagato >= importo_totale:
            stato = "pagato"
        elif appunti == "OK":
            stato = "pagato"
        elif importo_pagato > 0:
            stato = "parziale"

        record = {
            "tipo": "uscita",
            "soggetto_id": soggetto_id,
            "fattura_riferimento": fattura_nr,
            "importo_totale": importo_totale,
            "importo_pagato": importo_pagato,
            "data_emissione": data_emissione,
            "data_scadenza": data_scadenza,
            "data_pianificata": data_scadenza,
            "data_pagamento": data_pagamento,
            "stato": stato,
            "note": (
                str(row.get("NOTE", "")).strip()
                if not pd.isna(row.get("NOTE", ""))
                else None
            ),
        }

        records_to_upsert.append(record)

    # Deduplica in memoria per evitare violazioni indice (stessa chiave ripetuta in Excel)
    dedup: dict[tuple[str, str | None, str], dict[str, Any]] = {}
    for rec in records_to_upsert:
        key = (
            rec.get("fattura_riferimento"),
            rec.get("soggetto_id"),
            rec.get("data_scadenza"),
        )
        dedup[key] = rec

    records_to_upsert = list(dedup.values())

    print(f"🚀 Record pronti: {len(records_to_upsert)}")
    if skipped_missing_key:
        print(f"⚠️ Righe saltate (chiavi mancanti fattura/scadenza): {skipped_missing_key}")

    if dry_run:
        print("🧪 Dry-run attivo: nessuna modifica su Supabase.")
        return

    if mirror_mode:
        print("🧹 Mirror mode: pulizia uscite esistenti...")
        supabase.table("scadenze_pagamento").delete().eq("tipo", "uscita").execute()

    print("📤 Invio dati a blocchi...")
    for i in range(0, len(records_to_upsert), CHUNK_SIZE):
        chunk = records_to_upsert[i : i + CHUNK_SIZE]
        (
            supabase.table("scadenze_pagamento")
            .upsert(
                chunk,
                on_conflict="fattura_riferimento,soggetto_id,data_scadenza",
            )
            .execute()
        )

    print("✅ Sincronizzazione completata con successo.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Excel MAIN -> Supabase")
    parser.add_argument(
        "--append-only",
        action="store_true",
        help="Non cancella le uscite esistenti prima dell'upsert.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Legge e valida i dati senza scrivere su Supabase.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_sync(mirror_mode=not args.append_only, dry_run=args.dry_run)
