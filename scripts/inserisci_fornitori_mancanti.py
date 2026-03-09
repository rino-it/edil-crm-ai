"""
Inserisce i fornitori mancanti e le relative scadenze direttamente dall'Excel.

Fornitori gestiti:
  - Cofidis SA         → crea anagrafica + 4 rate mensili da_pagare
  - Manzoini Christian → crea anagrafica + 1 parcella da_pagare
  - Edilscavi Perani   → solo scadenza (anagrafica già presente)
  - Per Piu Soluzioni  → FR A26/237 €455 aperta (le altre già in CRM come pagato)

Uso:
  python scripts/inserisci_fornitori_mancanti.py          # dry-run
  python scripts/inserisci_fornitori_mancanti.py --execute
"""
import os
import sys
from datetime import datetime, date

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

EXECUTE = '--execute' in sys.argv
OGGI = date.today().isoformat()


def log(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode())


def get_or_create_anagrafica(ragione_sociale, tipo='fornitore', note=None):
    """Cerca in anagrafica, se non c'è la crea. Ritorna l'uuid."""
    anag = sb.table('anagrafica_soggetti').select('id,ragione_sociale').execute()
    term = ragione_sociale.lower()
    for a in anag.data:
        if (a.get('ragione_sociale') or '').lower() == term:
            log(f"   ✓ Anagrafica già presente: {a['ragione_sociale']} ({a['id']})")
            return a['id']

    # Non trovata → crea
    log(f"   + Creazione anagrafica: {ragione_sociale}")
    if EXECUTE:
        r = sb.table('anagrafica_soggetti').insert({
            'ragione_sociale': ragione_sociale,
            'tipo': tipo,
            'note': note,
            'condizioni_pagamento': '30gg DFFM',
        }).execute()
        new_id = r.data[0]['id']
        log(f"     → id={new_id}")
        return new_id
    else:
        return f'<NEW:{ragione_sociale}>'


def scadenza_esiste(soggetto_id, fattura_riferimento):
    r = sb.table('scadenze_pagamento').select('id').eq('soggetto_id', soggetto_id).eq('fattura_riferimento', fattura_riferimento).execute()
    return len(r.data) > 0


def crea_scadenza(sogg_id, nome, fattura_nr, data_emissione, data_scadenza, importo, stato='da_pagare', note=None):
    if scadenza_esiste(sogg_id, fattura_nr):
        log(f"   ⏭  Già presente: {nome} - {fattura_nr}")
        return False

    sc = {
        'tipo': 'uscita',
        'soggetto_id': sogg_id,
        'fattura_riferimento': fattura_nr,
        'importo_totale': importo,
        'importo_pagato': importo if stato == 'pagato' else 0,
        'data_emissione': data_emissione,
        'data_scadenza': data_scadenza,
        'data_pianificata': data_scadenza,
        'stato': stato,
        'descrizione': f'Fattura n. {fattura_nr} da {nome}',
        'fonte': 'manuale',
    }
    if note:
        sc['note'] = note

    log(f"   + Scadenza: {nome} | {fattura_nr} | scad {data_scadenza} | EUR {importo:,.2f} | {stato}")
    if EXECUTE:
        sb.table('scadenze_pagamento').insert(sc).execute()
    return True


def main():
    log('=' * 65)
    log('INSERIMENTO FORNITORI MANCANTI')
    log(f"Modalità: {'🔴 EXECUTE' if EXECUTE else '🟡 DRY-RUN'}")
    log('=' * 65)

    creati = 0

    # ─────────────────────────────────────────────────────
    # 1. COFIDIS SA — finanziamento rateale (4 rate aperte)
    # Scadenze: 14/02, 14/03, 14/04, 14/05/2026 — €1.354,50 cad.
    # ─────────────────────────────────────────────────────
    log('\n📌 COFIDIS SA')
    sid_cofidis = get_or_create_anagrafica('Cofidis SA', tipo='fornitore', note='Finanziamento rateale')
    rate_cofidis = [
        ('2026-02-14', '2026-02-14'),
        ('2026-03-14', '2026-03-14'),
        ('2026-04-14', '2026-04-14'),
        ('2026-05-14', '2026-05-14'),
    ]
    for i, (data_em, data_sc) in enumerate(rate_cofidis, 1):
        ok = crea_scadenza(
            sid_cofidis, 'Cofidis SA',
            f'FIN NR 253841 rata {i}',
            data_em, data_sc,
            1354.50, 'da_pagare',
        )
        if ok:
            creati += 1

    # ─────────────────────────────────────────────────────
    # 2. MANZOINI CHRISTIAN — parcella PROF 52/2025
    # ─────────────────────────────────────────────────────
    log('\n📌 MANZOINI CHRISTIAN AVVOCATO')
    sid_manzoini = get_or_create_anagrafica('Manzoini Christian Avvocato', tipo='fornitore')
    ok = crea_scadenza(
        sid_manzoini, 'Manzoini Christian Avvocato',
        'PROF 52/2025',
        '2025-12-15', '2025-12-19',
        6145.60, 'da_pagare',
        note='Ricorso decreto ingiuntivo Edilvertova vs Immobiliare 72',
    )
    if ok:
        creati += 1

    # ─────────────────────────────────────────────────────
    # 3. EDILSCAVI DI DAMIANO PERANI — proforma 14
    #    (anagrafica esistente id=77c9239f-...)
    # ─────────────────────────────────────────────────────
    log('\n📌 EDILSCAVI DI DAMIANO PERANI')
    anag = sb.table('anagrafica_soggetti').select('id').ilike('ragione_sociale', '%PERANI%').execute()
    if not anag.data:
        log('   ❌ Anagrafica non trovata!')
    else:
        sid_edilscavi = anag.data[0]['id']
        log(f'   ✓ Anagrafica trovata: {sid_edilscavi}')
        ok = crea_scadenza(
            sid_edilscavi, 'EDILSCAVI DI DAMIANO PERANI',
            'proforma 14',
            '2025-05-26', '2025-05-26',
            10000.00, 'scaduto',  # scadenza già passata
            note='Proforma / Bg Via Ghislandi',
        )
        if ok:
            creati += 1

    # ─────────────────────────────────────────────────────
    # 4. PER PIU SOLUZIONI SRL — FR A26/237 (€455 aperta)
    # ─────────────────────────────────────────────────────
    log('\n📌 PER PIU SOLUZIONI SRL')
    anag2 = sb.table('anagrafica_soggetti').select('id').ilike('ragione_sociale', '%PIU SOLUZIONI%').execute()
    if not anag2.data:
        log('   ❌ Anagrafica non trovata!')
    else:
        sid_perpiu = anag2.data[0]['id']
        log(f'   ✓ Anagrafica trovata: {sid_perpiu}')
        ok = crea_scadenza(
            sid_perpiu, 'PER PIU SOLUZIONI SRL',
            'FR A26/237',
            '2026-02-02', '2026-03-04',  # 30gg da emissione
            455.00, 'da_pagare',
        )
        if ok:
            creati += 1

    # ─────────────────────────────────────────────────────
    # GAENI MONICA — non trovata in Excel, skip
    # ─────────────────────────────────────────────────────
    log('\n⚠️  GAENI MONICA: non trovata nell\'Excel (né MAIN né REPORT XML).')
    log('   Verificare manualmente se si tratta di nota spese o fattura cartacea.')

    log(f'\n{"="*65}')
    log(f"{'✅ Completato' if EXECUTE else '🟡 Dry-run completato'}: {creati} scadenze da creare")
    if not EXECUTE:
        log('Usa --execute per applicare le modifiche.')


if __name__ == '__main__':
    main()
