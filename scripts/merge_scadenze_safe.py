"""
merge_scadenze_safe.py — Piano Sicuro: Merge XML→Excel senza perdere dati

LOGICA:
1. Per ogni gruppo di duplicati (stesso soggetto_id + fattura_riferimento + data_emissione):
   a. KEEPER = record più vecchio (created_at) O quello con più relazioni (cantiere, pagamenti)
   b. DONOR  = record più nuovo (quello XML appena importato)
   c. Merge:  importo_totale, file_url, data_emissione dal donor → keeper (se donor ha dati migliori)
   d. Verifica FK: se il donor ha riferimenti in movimenti_banca/rate_mutuo/titoli/fatture_vendita → NON cancellare
   e. Se FK libero → DELETE donor, SET keeper.fonte = 'verificato'
   f. Se FK bloccato → LOG e skip (richiede intervento manuale)

2. Record singoli (no duplicato):
   a. Se corrispondono a un record in fatture_fornitori → fonte = 'verificato'  
   b. Altrimenti → fonte = 'excel'

USO:
  python scripts/merge_scadenze_safe.py              # DRY-RUN (solo report)
  python scripts/merge_scadenze_safe.py --execute     # ESECUZIONE REALE
"""

import os
import sys
import json
from datetime import datetime
from collections import Counter
from dotenv import load_dotenv

load_dotenv(".env.local")
from supabase import create_client

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = "--execute" not in sys.argv
LOG_FILE = "merge_scadenze_log.txt"

# ─── Utility ──────────────────────────────────────────────────────────

def log(msg, file_handle=None):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode())
    if file_handle:
        file_handle.write(msg + "\n")


def fetch_all(table, select="*", page_size=1000):
    """Fetch all records from a table with pagination."""
    all_data = []
    offset = 0
    while True:
        r = sb.table(table).select(select).range(offset, offset + page_size - 1).execute()
        all_data.extend(r.data)
        if len(r.data) < page_size:
            break
        offset += page_size
    return all_data


def check_fk_references(scadenza_id):
    """Check if a scadenza is referenced by any FK in related tables."""
    refs = {}

    # movimenti_banca
    r = sb.table("movimenti_banca").select("id", count="exact").eq("scadenza_id", scadenza_id).execute()
    if r.count and r.count > 0:
        refs["movimenti_banca"] = r.count

    # rate_mutuo
    r = sb.table("rate_mutuo").select("id", count="exact").eq("scadenza_id", scadenza_id).execute()
    if r.count and r.count > 0:
        refs["rate_mutuo"] = r.count

    # titoli
    r = sb.table("titoli").select("id", count="exact").eq("scadenza_id", scadenza_id).execute()
    if r.count and r.count > 0:
        refs["titoli"] = r.count

    # fatture_vendita (try, may not exist yet)
    try:
        r = sb.table("fatture_vendita").select("id", count="exact").eq("scadenza_id", scadenza_id).execute()
        if r.count and r.count > 0:
            refs["fatture_vendita"] = r.count
    except Exception:
        pass

    return refs


def record_weight(rec):
    """Score a record by how much 'real data' it has (higher = keep it)."""
    w = 0
    if rec.get("cantiere_id"):
        w += 10          # cantiere assignment is precious
    if rec.get("importo_pagato") and float(rec["importo_pagato"]) > 0:
        w += 8           # payment history
    if rec.get("stato") in ("pagato", "parziale"):
        w += 5           # manual stato change
    if rec.get("data_pianificata"):
        w += 3           # manual planning
    if rec.get("file_url"):
        w += 2           # PDF already linked
    if rec.get("note") or rec.get("descrizione"):
        w += 1           # manual notes
    return w


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    mode_label = "🔍 DRY-RUN" if DRY_RUN else "🚀 ESECUZIONE REALE"
    
    with open(LOG_FILE, "w", encoding="utf-8") as logf:
        log(f"{'='*70}", logf)
        log(f"  MERGE SCADENZE SAFE — {mode_label}", logf)
        log(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", logf)
        log(f"{'='*70}\n", logf)

        # ─── Step 1: Fetch all data ──────────────────────────────────
        log("📥 Caricamento dati...", logf)
        
        scadenze = fetch_all(
            "scadenze_pagamento",
            "id,created_at,soggetto_id,fattura_riferimento,data_emissione,data_scadenza,"
            "importo_totale,importo_pagato,stato,fonte,file_url,cantiere_id,"
            "data_pianificata,note,descrizione,tipo,auto_domiciliazione"
        )
        log(f"   Scadenze totali: {len(scadenze)}", logf)
        
        # Fonte distribution
        fonti = Counter(s.get("fonte") or "NULL" for s in scadenze)
        for k, v in fonti.most_common():
            log(f"   - fonte={k}: {v}", logf)

        # Fetch fatture_fornitori for cross-reference
        fatture = fetch_all(
            "fatture_fornitori",
            "id,soggetto_id,numero_fattura,data_fattura"
        )
        fatture_index = set()
        for f in fatture:
            key = (f.get("soggetto_id"), f.get("numero_fattura"), f.get("data_fattura"))
            fatture_index.add(key)
        log(f"   Fatture fornitori (indice): {len(fatture_index)}", logf)

        # ─── Step 2: Group duplicates ────────────────────────────────
        log("\n📊 Analisi duplicati...", logf)
        
        key_map = {}
        for s in scadenze:
            key = (s.get("soggetto_id"), s.get("fattura_riferimento"), s.get("data_emissione"))
            key_map.setdefault(key, []).append(s)

        dups = {k: v for k, v in key_map.items() if len(v) > 1}
        singles = {k: v[0] for k, v in key_map.items() if len(v) == 1}
        
        log(f"   Gruppi duplicati: {len(dups)}", logf)
        log(f"   Record singoli: {len(singles)}", logf)

        # ─── Step 3: Merge duplicates ────────────────────────────────
        log(f"\n{'─'*70}", logf)
        log("🔄 MERGE DUPLICATI", logf)
        log(f"{'─'*70}\n", logf)

        stats = {
            "merged": 0,
            "fk_blocked": 0,
            "skipped_no_clear_donor": 0,
            "errors": 0,
        }
        
        merge_log = []

        for (sid, fatt, data_em), records in sorted(dups.items(), key=lambda x: x[0][1] or ""):
            
            # Sort records: identify keeper vs donor
            # Strategy: if one has fonte='fattura' → that's the donor (XML, just imported)
            #           the other (fonte=NULL) → keeper (Excel, has history)
            #           if both NULL → use weight scoring + created_at
            
            fattura_records = [r for r in records if r.get("fonte") == "fattura"]
            null_records = [r for r in records if (r.get("fonte") or "NULL") == "NULL"]
            other_records = [r for r in records if r.get("fonte") not in (None, "fattura")]
            
            if len(records) == 2:
                if len(fattura_records) == 1 and len(null_records) == 1:
                    # Caso ideale: 1 XML + 1 Excel
                    keeper = null_records[0]
                    donor = fattura_records[0]
                elif len(null_records) == 2:
                    # Entrambi NULL — uno è vecchio XML, l'altro Excel
                    # Usa weight scoring
                    r_sorted = sorted(null_records, key=lambda r: record_weight(r), reverse=True)
                    keeper = r_sorted[0]
                    donor = r_sorted[1]
                    # Se pari, tieni il più vecchio (created_at)
                    if record_weight(keeper) == record_weight(donor):
                        r_sorted = sorted(null_records, key=lambda r: r.get("created_at", ""))
                        keeper = r_sorted[0]
                        donor = r_sorted[1]
                else:
                    log(f"   ⚠️ SKIP gruppo inatteso: fattura='{fatt}' del {data_em} "
                        f"(fonti: {[r.get('fonte') for r in records]})", logf)
                    stats["skipped_no_clear_donor"] += 1
                    continue
            elif len(records) > 2:
                # 3+ duplicati — teniamo quello con più peso, merge il resto
                all_sorted = sorted(records, key=lambda r: (record_weight(r), r.get("created_at", "")), reverse=True)
                keeper = all_sorted[0]
                # Tutti gli altri sono donor (li processiamo uno alla volta)
                donors_list = all_sorted[1:]
                
                for donor in donors_list:
                    entry = process_merge(keeper, donor, fatt, data_em, logf, stats, DRY_RUN)
                    if entry:
                        merge_log.append(entry)
                continue
            else:
                continue
            
            entry = process_merge(keeper, donor, fatt, data_em, logf, stats, DRY_RUN)
            if entry:
                merge_log.append(entry)

        log(f"\n{'─'*70}", logf)
        log("📈 RISULTATO MERGE:", logf)
        log(f"   ✅ Merge riusciti: {stats['merged']}", logf)
        log(f"   🔒 Bloccati da FK: {stats['fk_blocked']}", logf)
        log(f"   ⚠️ Skippati (ambigui): {stats['skipped_no_clear_donor']}", logf)
        log(f"   ❌ Errori: {stats['errors']}", logf)
        log(f"{'─'*70}\n", logf)

        # ─── Step 4: Label remaining singles ─────────────────────────
        log("🏷️ ETICHETTATURA RECORD SINGOLI", logf)
        log(f"{'─'*70}\n", logf)

        label_stats = {"verificato": 0, "excel": 0, "excel_no_date": 0, "already_set": 0, "fattura_solo": 0}

        for key, rec in singles.items():
            fonte_attuale = rec.get("fonte")
            
            # Skip if already labeled
            if fonte_attuale in ("verificato", "titolo", "mutuo", "manuale"):
                label_stats["already_set"] += 1
                continue
            
            sid, fatt, data_em = key
            
            # Rule 1: No data_emissione → automatically 'excel'
            # These are acconti, rate, spese cassa edile — no fiscal doc
            if not data_em:
                new_fonte = "excel"
                label_stats["excel_no_date"] += 1
            # Rule 2: fonte='fattura' (solo XML, no Excel duplicate) → leave as 'fattura'
            elif fonte_attuale == "fattura":
                label_stats["fattura_solo"] += 1
                continue  # Don't change — it's a valid XML-only record
            # Rule 3: Has date → check if matches fatture_fornitori
            else:
                ff_key = (sid, fatt, data_em)
                if ff_key in fatture_index:
                    new_fonte = "verificato"
                    label_stats["verificato"] += 1
                else:
                    new_fonte = "excel"
                    label_stats["excel"] += 1
            
            if not DRY_RUN:
                try:
                    sb.table("scadenze_pagamento").update({"fonte": new_fonte}).eq("id", rec["id"]).execute()
                except Exception as e:
                    log(f"   ❌ Errore etichettatura {rec['id'][:8]}: {e}", logf)

        log(f"   🟢 fonte='verificato' (Excel + XML match): {label_stats['verificato']}", logf)
        log(f"   🟡 fonte='excel' (con data, no XML match): {label_stats['excel']}", logf)
        log(f"   🟠 fonte='excel' (senza data emissione):  {label_stats['excel_no_date']}", logf)
        log(f"   🔵 fonte='fattura' (solo XML, no Excel):  {label_stats['fattura_solo']}", logf)
        log(f"   ⚪ Già etichettati (skip): {label_stats['already_set']}", logf)

        # ─── Step 5: Also label keepers from merge as 'verificato' ───
        # (Already done in process_merge)

        # ─── Final summary ───────────────────────────────────────────
        log(f"\n{'='*70}", logf)
        log("📋 SOMMARIO FINALE", logf)
        log(f"{'='*70}", logf)
        
        total_before = len(scadenze)
        deleted_count = stats["merged"]
        total_after = total_before - deleted_count
        
        log(f"   Record prima:  {total_before}", logf)
        log(f"   Eliminati:     {deleted_count}", logf)
        log(f"   Record dopo:   {total_after}", logf)
        log(f"   Verificati:    {label_stats['verificato'] + stats['merged']}", logf)
        log(f"   Solo Excel:    {label_stats['excel'] + label_stats['excel_no_date']}", logf)
        log(f"    - con data:   {label_stats['excel']}", logf)
        log(f"    - senza data: {label_stats['excel_no_date']} (acconti/rate/spese)", logf)
        log(f"   Solo XML:      {label_stats['fattura_solo']}", logf)
        log(f"   Bloccati FK:   {stats['fk_blocked']}", logf)
        
        if DRY_RUN:
            log(f"\n   ⚠️ DRY-RUN: nessuna modifica effettuata.", logf)
            log(f"   Per eseguire: python scripts/merge_scadenze_safe.py --execute", logf)
        else:
            log(f"\n   ✅ Merge completato con successo.", logf)
        
        log(f"\n   Log salvato in: {LOG_FILE}", logf)
        log(f"{'='*70}", logf)

        # Save detailed merge log as JSON for audit
        if merge_log:
            audit_file = "merge_scadenze_audit.json"
            with open(audit_file, "w", encoding="utf-8") as af:
                json.dump(merge_log, af, indent=2, ensure_ascii=False, default=str)
            log(f"   Audit dettagliato: {audit_file}", logf)


def process_merge(keeper, donor, fatt, data_em, logf, stats, dry_run):
    """Process a single merge: donor → keeper."""
    
    keeper_id = keeper["id"]
    donor_id = donor["id"]
    keeper_fonte = keeper.get("fonte") or "NULL"
    donor_fonte = donor.get("fonte") or "NULL"
    
    log(f"   📄 Fattura '{fatt}' del {data_em}", logf)
    log(f"      KEEPER [{keeper_fonte}] id={keeper_id[:8]}… "
        f"imp={keeper.get('importo_totale')} stato={keeper.get('stato')} "
        f"cantiere={'✅' if keeper.get('cantiere_id') else '—'} "
        f"pdf={'✅' if keeper.get('file_url') else '—'}", logf)
    log(f"      DONOR  [{donor_fonte}] id={donor_id[:8]}… "
        f"imp={donor.get('importo_totale')} stato={donor.get('stato')} "
        f"cantiere={'✅' if donor.get('cantiere_id') else '—'} "
        f"pdf={'✅' if donor.get('file_url') else '—'}", logf)
    
    # ─── Check FK on donor ────────────────────────────────────────
    donor_refs = check_fk_references(donor_id)
    if donor_refs:
        log(f"      🔒 DONOR ha FK attivi: {donor_refs} → SKIP (serve intervento manuale)", logf)
        stats["fk_blocked"] += 1
        return {
            "action": "FK_BLOCKED",
            "keeper_id": keeper_id,
            "donor_id": donor_id,
            "fattura": fatt,
            "data_emissione": data_em,
            "fk_refs": donor_refs,
        }
    
    # ─── Build update payload: merge donor data into keeper ───────
    update = {}
    merge_details = []
    
    # Importo: se il donor ha un importo diverso e proviene da XML, è più affidabile
    if donor.get("importo_totale") and keeper.get("importo_totale"):
        d_imp = float(donor["importo_totale"])
        k_imp = float(keeper["importo_totale"])
        if d_imp != k_imp and donor_fonte == "fattura":
            # XML importo is the fiscal truth — use it
            update["importo_totale"] = d_imp
            merge_details.append(f"importo: {k_imp} → {d_imp}")
    
    # File URL: se il donor ha il PDF e il keeper no → copia
    if donor.get("file_url") and not keeper.get("file_url"):
        update["file_url"] = donor["file_url"]
        merge_details.append("file_url copiato")
    
    # Data emissione: se il keeper non ce l'ha → copia dal donor
    if donor.get("data_emissione") and not keeper.get("data_emissione"):
        update["data_emissione"] = donor["data_emissione"]
        merge_details.append("data_emissione copiata")
    
    # Auto domiciliazione: se il donor ce l'ha → copia
    if donor.get("auto_domiciliazione") and not keeper.get("auto_domiciliazione"):
        update["auto_domiciliazione"] = True
        merge_details.append("auto_domiciliazione copiata")
    
    # Descrizione: se più ricca nel donor → copia
    if donor.get("descrizione") and not keeper.get("descrizione"):
        update["descrizione"] = donor["descrizione"]
        merge_details.append("descrizione copiata")
    
    # Cantiere: se solo il donor ce l'ha (raro, ma possibile)
    if donor.get("cantiere_id") and not keeper.get("cantiere_id"):
        update["cantiere_id"] = donor["cantiere_id"]
        merge_details.append("cantiere_id copiato")
    
    # Always set fonte = 'verificato' on keeper
    update["fonte"] = "verificato"
    
    if merge_details:
        log(f"      📝 Merge: {', '.join(merge_details)}", logf)
    else:
        log(f"      📝 Solo etichettatura (nessun dato da copiare)", logf)
    
    if not dry_run:
        try:
            # Step 1: Update keeper with merged data
            sb.table("scadenze_pagamento").update(update).eq("id", keeper_id).execute()
            
            # Step 2: Delete donor (safe — no FK references)
            sb.table("scadenze_pagamento").delete().eq("id", donor_id).execute()
            
            log(f"      ✅ MERGE OK — donor eliminato", logf)
        except Exception as e:
            log(f"      ❌ ERRORE: {e}", logf)
            stats["errors"] += 1
            return {
                "action": "ERROR",
                "keeper_id": keeper_id,
                "donor_id": donor_id,
                "error": str(e),
            }
    else:
        log(f"      [DRY-RUN] Sarebbe stato eseguito", logf)
    
    stats["merged"] += 1
    
    return {
        "action": "MERGED",
        "keeper_id": keeper_id,
        "donor_id": donor_id,
        "fattura": fatt,
        "data_emissione": data_em,
        "keeper_fonte_before": keeper.get("fonte"),
        "donor_fonte": donor.get("fonte"),
        "fields_merged": merge_details,
        "update_payload": update,
    }


if __name__ == "__main__":
    main()
