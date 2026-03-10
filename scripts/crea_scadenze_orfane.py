"""
Crea scadenze_pagamento per tutte le fatture_fornitori che non ne hanno una.

Logica:
  - Trova fatture_fornitori senza match in scadenze_pagamento
    (match su soggetto_id + fattura_riferimento + data_emissione)
  - Legge il CSV esposizione per determinare stato:
      Sdo='x'/'X' → pagato
      Sdo=''      → da_pagare
      Non trovata → pagato (default sicuro)
  - Data scadenza presa dal CSV se disponibile, altrimenti calcolata
  - fonte='fattura'

Uso:
  python scripts/crea_scadenze_orfane.py          # dry-run (default)
  python scripts/crea_scadenze_orfane.py --execute # scrittura reale
"""
import os
import sys
import json
import re
import csv
from datetime import datetime, timedelta
import calendar
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

EXECUTE = "--execute" in sys.argv
JSON_OUTPUT = "--json" in sys.argv
CSV_PATH = os.path.join(os.path.dirname(__file__), '_esposizione.csv')

def log(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode())

def fetch_all(table, select, filters=None):
    all_data = []
    offset = 0
    while True:
        q = sb.table(table).select(select).range(offset, offset + 999)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        r = q.execute()
        all_data.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return all_data


def calcola_data_scadenza(data_emissione_str, condizioni):
    """Calcola scadenza da data emissione + condizioni (es. '30gg DFFM', '60gg')"""
    try:
        data_base = datetime.strptime(data_emissione_str, "%Y-%m-%d")
        giorni = 30
        if condizioni:
            match = re.search(r'(\d+)', condizioni)
            if match:
                giorni = int(match.group(1))

        scadenza = data_base + timedelta(days=giorni)

        if condizioni and "DFFM" in condizioni.upper():
            ultimo_giorno = calendar.monthrange(scadenza.year, scadenza.month)[1]
            scadenza = scadenza.replace(day=ultimo_giorno)

        return scadenza.strftime("%Y-%m-%d")
    except Exception:
        return (datetime.strptime(data_emissione_str, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d")


def normalize_fattura_nr(nr):
    """Normalizza numero fattura per matching: strip leading zeros, spazi, lowercase"""
    if not nr:
        return ""
    nr = nr.strip().lower()
    # Rimuovi prefissi tipo "000000" ma preserva il contenuto significativo
    nr = re.sub(r'^0+', '', nr)
    # Rimuovi spazi interni
    nr = nr.replace(' ', '')
    # Rimuovi eventuali prefissi "fpr" per professionisti  
    # nr = re.sub(r'^fpr\s*', '', nr)  # no, manteniamo FPR
    return nr


def parse_csv_esposizione(csv_path):
    """
    Legge il CSV esposizione e costruisce un lookup:
      chiave: numero_fattura normalizzato
      valore: lista di {sdo, scadenza, importo, fornitore}
    """
    lookup = {}
    if not os.path.exists(csv_path):
        log(f"⚠️  CSV non trovato: {csv_path}")
        return lookup
    
    with open(csv_path, 'r', encoding='latin-1') as f:
        reader = csv.reader(f)
        header = next(reader)  # skip header
        for row in reader:
            if len(row) < 5 or not row[0].strip():
                continue
            fornitore = row[0].strip()
            fattura_nr = row[1].strip()
            data_emissione_str = row[2].strip()  # dd/mm/yyyy
            scadenza_str = row[3].strip()  # dd/mm/yyyy
            sdo = row[4].strip().lower()  # 'x' = pagato, '' = aperto
            importo_str = row[5].strip() if len(row) > 5 else ''
            
            if not fattura_nr:
                continue
            
            key = normalize_fattura_nr(fattura_nr)
            if key not in lookup:
                lookup[key] = []
            
            # Converti data scadenza
            data_scad = None
            if scadenza_str:
                try:
                    parts = scadenza_str.split('/')
                    if len(parts) == 3:
                        data_scad = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                except:
                    pass
            
            # Converti data emissione
            data_em = None
            if data_emissione_str:
                try:
                    parts = data_emissione_str.split('/')
                    if len(parts) == 3:
                        data_em = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                except:
                    pass
            
            lookup[key].append({
                'fornitore': fornitore,
                'sdo': sdo,
                'scadenza': data_scad,
                'data_emissione': data_em,
                'importo': importo_str,
                'pagato': sdo in ('x', 'X'),
            })
    
    return lookup


def match_csv(csv_lookup, numero_fattura, data_fattura):
    """
    Cerca nel CSV il match per una fattura.
    Ritorna: (pagato: bool, data_scadenza: str|None)
    """
    key = normalize_fattura_nr(numero_fattura)
    
    if key not in csv_lookup:
        # Fallback: strip "/N" suffix (es. DB="150/1" → "150", CSV="150")
        import re as _re
        base = _re.sub(r'/\d+$', '', key)
        if base != key and base in csv_lookup:
            key = base
        else:
            return None, None
    
    entries = csv_lookup[key]
    
    # Se c'è una sola entry, usala
    if len(entries) == 1:
        e = entries[0]
        return e['pagato'], e['scadenza']
    
    # Più entries: cerca match per data emissione
    for e in entries:
        if e['data_emissione'] == data_fattura:
            return e['pagato'], e['scadenza']
    
    # Fallback: se TUTTE sono pagate, è pagata. Se qualcuna è aperta, scegli quella aperta.
    aperti = [e for e in entries if not e['pagato']]
    if aperti:
        return False, aperti[0]['scadenza']
    
    # Tutte pagate
    return True, entries[0]['scadenza']


def main():
    log("=" * 70)
    log("CREAZIONE SCADENZE per fatture_fornitori orfane")
    log(f"Modalità: {'🔴 EXECUTE' if EXECUTE else '🟡 DRY-RUN'}")
    log("=" * 70)

    # 0. Carica CSV esposizione
    log(f"\n📄 Caricamento CSV: {CSV_PATH}")
    csv_lookup = parse_csv_esposizione(CSV_PATH)
    log(f"   Chiavi fattura nel CSV: {len(csv_lookup)}")

    # 1. Fetch tutti i dati
    log("\n📦 Caricamento dati Supabase...")
    ff_all = fetch_all('fatture_fornitori',
        'id,soggetto_id,numero_fattura,data_fattura,importo_totale,ragione_sociale,piva_fornitore')
    sc_all = fetch_all('scadenze_pagamento', 'soggetto_id,fattura_riferimento,data_emissione')
    anag_all = fetch_all('anagrafica_soggetti', 'id,condizioni_pagamento,ragione_sociale')

    log(f"   Fatture fornitori: {len(ff_all)}")
    log(f"   Scadenze attuali:  {len(sc_all)}")
    log(f"   Anagrafiche:       {len(anag_all)}")

    # 2. Indice condizioni pagamento per soggetto_id
    cond_map = {}
    for a in anag_all:
        cond_map[a['id']] = a.get('condizioni_pagamento') or '30gg DFFM'

    # 3. Trova orfane
    sc_keys = set()
    for s in sc_all:
        sc_keys.add((s.get('soggetto_id'), s.get('fattura_riferimento'), s.get('data_emissione')))

    orphans = []
    for f in ff_all:
        key = (f.get('soggetto_id'), f.get('numero_fattura'), f.get('data_fattura'))
        if key not in sc_keys:
            orphans.append(f)

    log(f"\n🔍 Fatture SENZA scadenza: {len(orphans)}")

    if not orphans:
        log("✅ Nessuna orfana trovata. Tutto a posto!")
        if JSON_OUTPUT:
            print(f"###JSON_RESULT###{json.dumps({'orphans_found': 0, 'scadenze_created': 0, 'errors': 0})}")
        return

    # 4. Prepara le scadenze da creare
    to_create = []
    importo_totale_sum = 0
    stats = {'pagato': 0, 'da_pagare': 0, 'csv_match': 0, 'csv_no_match': 0, 'csv_scadenza_usata': 0}

    for f in orphans:
        sogg_id = f.get('soggetto_id')
        numero = f.get('numero_fattura', '?')
        data_fatt = f.get('data_fattura')
        importo = f.get('importo_totale', 0) or 0
        nome = f.get('ragione_sociale', '?')
        condizioni = cond_map.get(sogg_id, '30gg DFFM')

        if not data_fatt:
            log(f"   ⚠️  SKIP (no data_fattura): {nome} - {numero}")
            continue

        # Determina stato dal CSV
        csv_pagato, csv_scadenza = match_csv(csv_lookup, numero, data_fatt)
        
        if csv_pagato is not None:
            stats['csv_match'] += 1
            stato = 'pagato' if csv_pagato else 'da_pagare'
        else:
            stats['csv_no_match'] += 1
            stato = 'da_pagare'  # default: senza info CSV = da verificare/pagare
        
        stats[stato] += 1

        # Data scadenza: preferisci CSV, poi calcola
        if csv_scadenza:
            data_scad = csv_scadenza
            stats['csv_scadenza_usata'] += 1
        else:
            data_scad = calcola_data_scadenza(data_fatt, condizioni)

        scadenza_data = {
            "tipo": "uscita",
            "soggetto_id": sogg_id,
            "fattura_riferimento": numero,
            "importo_totale": importo,
            "importo_pagato": importo if stato == 'pagato' else 0,
            "data_emissione": data_fatt,
            "data_scadenza": data_scad,
            "data_pianificata": data_scad,
            "stato": stato,
            "descrizione": f"Fattura n. {numero} da {nome}",
            "fonte": "fattura",
        }

        to_create.append(scadenza_data)
        importo_totale_sum += importo

    log(f"\n📝 Scadenze da creare: {len(to_create)}")
    log(f"   Importo totale: EUR {importo_totale_sum:,.2f}")
    log(f"\n📊 Matching con CSV esposizione:")
    log(f"   Match CSV trovati:    {stats['csv_match']}")
    log(f"   Senza match CSV:     {stats['csv_no_match']} (-> default da_pagare)")
    log(f"   Scadenza da CSV:     {stats['csv_scadenza_usata']}")
    log(f"\n📊 Stato assegnato:")
    log(f"   da_pagare:  {stats['da_pagare']}")
    log(f"   pagato:     {stats['pagato']}")

    # 5. Report per stato
    aperti = [s for s in to_create if s['stato'] == 'da_pagare']
    pagati = [s for s in to_create if s['stato'] == 'pagato']
    
    imp_aperti = sum(s['importo_totale'] for s in aperti)
    imp_pagati = sum(s['importo_totale'] for s in pagati)

    log(f"\n💰 Importi:")
    log(f"   Da pagare: EUR {imp_aperti:>12,.2f} ({len(aperti)} scadenze)")
    log(f"   Pagate:    EUR {imp_pagati:>12,.2f} ({len(pagati)} scadenze)")

    # 5b. Report dettaglio DA_PAGARE (quelle che contano)
    if aperti:
        log(f"\n{'='*80}")
        log(f"DETTAGLIO SCADENZE DA_PAGARE (aperte)")
        log(f"{'='*80}")
        log(f"{'FORNITORE':<42} | {'FATTURA':<20} | {'DATA EM.':<10} | {'SCADENZA':<10} | {'IMPORTO':>12}")
        log(f"{'-'*100}")
        for s in sorted(aperti, key=lambda x: -x['importo_totale']):
            nome = s['descrizione'].split(' da ')[-1][:40]
            log(f"  {nome:<40} | {s['fattura_riferimento']:<20} | {s['data_emissione']} | {s['data_scadenza']} | {s['importo_totale']:>12,.2f}")
        log(f"{'-'*100}")
        log(f"  {'TOTALE DA PAGARE':<40} | {'':>20} | {'':>10} | {'':>10} | {imp_aperti:>12,.2f}")

    # 5c. Report per fornitore (solo aperte)
    by_fornitore = {}
    for sc in to_create:
        desc = sc['descrizione']
        # Estrai nome fornitore dal descrizione
        nome = desc.split(' da ')[-1] if ' da ' in desc else '?'
        if nome not in by_fornitore:
            by_fornitore[nome] = {'count': 0, 'importo': 0}
        by_fornitore[nome]['count'] += 1
        by_fornitore[nome]['importo'] += sc['importo_totale']

    log(f"\n{'FORNITORE':<45} | {'N.':<4} | {'IMPORTO':>12}")
    log("-" * 70)
    for nome, info in sorted(by_fornitore.items(), key=lambda x: -x[1]['importo']):
        log(f"  {nome[:43]:<43} | {info['count']:<4} | EUR {info['importo']:>10,.2f}")

    # 6. Dettaglio TOP COPERTURE (caso specifico segnalato)
    top = [s for s in to_create if 'TOP COPERTURE' in s.get('descrizione', '').upper()]
    if top:
        log(f"\n🎯 TOP COPERTURE - dettaglio:")
        for s in top:
            log(f"   Fatt. {s['fattura_riferimento']} | {s['data_emissione']} → scad {s['data_scadenza']} | EUR {s['importo_totale']:,.2f} | {s['stato'].upper()}")

    # 7. Esecuzione
    if EXECUTE:
        log(f"\n🔴 ESECUZIONE: creazione {len(to_create)} scadenze...")
        created = 0
        errors = 0
        for sc in to_create:
            try:
                sb.table("scadenze_pagamento").insert(sc).execute()
                created += 1
            except Exception as e:
                errors += 1
                log(f"   ❌ Errore: {sc['fattura_riferimento']} - {e}")

        log(f"\n✅ Create: {created} ({stats['da_pagare']} da_pagare, {stats['pagato']} pagate)")
        if errors:
            log(f"❌ Errori: {errors}")

        # Audit log
        audit = {
            "timestamp": datetime.now().isoformat(),
            "orphans_found": len(orphans),
            "scadenze_created": created,
            "errors": errors,
            "importo_totale": importo_totale_sum,
            "da_pagare": stats['da_pagare'],
            "pagate": stats['pagato'],
            "csv_match": stats['csv_match'],
            "csv_no_match": stats['csv_no_match'],
            "importo_da_pagare": imp_aperti,
            "importo_pagate": imp_pagati,
        }
        with open("crea_scadenze_orfane_audit.json", "w") as f:
            json.dump(audit, f, indent=2)
        log(f"\n📄 Audit salvato in crea_scadenze_orfane_audit.json")

        if JSON_OUTPUT:
            print(f"###JSON_RESULT###{json.dumps(audit)}")
    else:
        log(f"\n🟡 DRY-RUN completato. Usa --execute per creare le scadenze.")
        if JSON_OUTPUT:
            print(f"###JSON_RESULT###{json.dumps({'dry_run': True, 'orphans_found': len(orphans), 'da_pagare': stats['da_pagare'], 'pagate': stats['pagato'], 'importo_da_pagare': imp_aperti, 'importo_pagate': imp_pagati})}")


if __name__ == "__main__":
    main()
