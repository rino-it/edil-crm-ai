"""
Confronto esposizione fornitori: CRM vs Excel pivot
"""
import os
import re
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

# Excel values (dalla pivot immagine - normalizzati)
EXCEL = {
    'albero group': 104.80,
    'andrea losa giardini': 1390.80,
    'b m srl': 4100.00,
    'baccino marco': 991.00,
    'baldi giovanni': 1330.36,
    'bcc di milano': 0.61,
    'bellini e associati': 2613.90,
    'belloli attilio': 44044.95,
    'bergamelli srl': 2024.41,
    'bordogni fabio': -126.88,
    'casali nicola': 3981.60,
    'cofidis sa': 5418.00,
    'comitato paritetico': 78.08,
    'consit mangili sibella': 1098.00,
    'cortinovis gianluigi': 8588.32,
    'costruzioni edili almici': 4100.00,
    'cucchi peter': 1600.00,
    'delprino': 13109.85,
    'ecoberg srl': 573.77,
    'edil karim': 7200.00,
    'edilcassa': 1140.00,
    'edilcommercio srl': 4207.13,
    'edilnova': 392.84,
    'edilscavi di damiano perani': 10000.00,
    'f lli testa srl': 10055.85,
    'facchi srl': 463.60,
    'faip srl': 139.08,
    'fratelli baggi srl': 3000.00,
    'g m v impianti elettrici': 80000.00,
    'gaeni monica': 555.01,
    'imberti daniele': 13700.00,
    'gmg centroedile': 3575.00,
    'intesa home': 8500.00,
    'kuwait petroleum': 1112.50,
    'la piazzoni': 8332.60,
    'lanfranchi marco': 2731.58,
    'leaders srl': 8430.00,
    'madaschi giuseppe': 10027.80,
    'manzoini christian avvocato': 6145.60,
    'met energia italia spa': 1163.22,
    'moioli valerio': 101.20,
    'myo spa': 153.54,
    'nodari bruno': 900.00,
    'olimpia srl': 1263.08,
    'p p lmc srl': 361.17,
    'pc genesi di bosio ferruccio': 98.80,
    'pedretti srl': 80180.00,
    'per piu soluzioni srl': 494.00,
    'rbp srl': 31193.11,
    'ruggipav sas': 6700.00,
    'salvetti srl': 40000.00,
    'system project srl': 789.59,
    'tappezziere moroni': 3090.00,
    'termoidraulica': 13000.00,
    'tim spa': 105.07,
    'top coperture': 70000.00,
    'uniacque': 0.00,
    'verisure italy srl': 167.98,
    'viemme porte srl': 101.68,
}

def norm(s):
    s = s.lower()
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# Fetch CRM
r = sb.table('scadenze_pagamento').select('soggetto_id,importo_totale,importo_pagato,stato').in_('stato', ['da_pagare', 'scaduto']).eq('tipo', 'uscita').execute()
anag = sb.table('anagrafica_soggetti').select('id,ragione_sociale').execute()
anag_map = {a['id']: a['ragione_sociale'] for a in anag.data}

by_sogg = defaultdict(float)
by_sogg_name = {}
for row in r.data:
    sid = row.get('soggetto_id') or 'NULL'
    imp = (row.get('importo_totale') or 0) - (row.get('importo_pagato') or 0)
    by_sogg[sid] += imp
    by_sogg_name[sid] = anag_map.get(sid, str(sid))

crm_norm = {}
for sid, imp in by_sogg.items():
    nome = by_sogg_name[sid]
    crm_norm[norm(nome)] = (nome, imp, sid)

# Match Excel -> CRM
used_crm = set()
rows = []

for key_ex, val_ex in EXCEL.items():
    best_key = None
    best_score = 0
    for key_crm in crm_norm:
        words_ex = set(key_ex.split())
        words_crm = set(key_crm.split())
        common = words_ex & words_crm
        score = len(common) / max(len(words_ex), 1)
        if score > best_score and score >= 0.4:
            best_score = score
            best_key = key_crm

    if best_key and best_key not in used_crm:
        used_crm.add(best_key)
        nome_crm, val_crm, sid = crm_norm[best_key]
        diff = val_crm - val_ex
        rows.append({'ex': key_ex, 'val_ex': val_ex, 'crm': nome_crm, 'val_crm': val_crm, 'diff': diff, 'matched': True})
    else:
        rows.append({'ex': key_ex, 'val_ex': val_ex, 'crm': None, 'val_crm': None, 'diff': None, 'matched': False})

# Fornitori solo in CRM (non nel Excel)
only_crm = [(nome, imp) for key, (nome, imp, sid) in crm_norm.items() if key not in used_crm and imp != 0]

# Output
print()
print(f"{'FORNITORE (Excel)':<40} | {'EXCEL':>11} | {'CRM':>11} | {'DIFF':>9}")
print('-' * 78)

rows_sorted = sorted(rows, key=lambda x: -abs(x['val_ex']))
for row in rows_sorted:
    if row['matched']:
        diff = row['diff']
        flag = ' !!!' if abs(diff) > 100 else ''
        print(f"  {row['ex'][:38]:<38} | {row['val_ex']:>11,.2f} | {row['val_crm']:>11,.2f} | {diff:>+9,.2f}{flag}")
    else:
        print(f"  {row['ex'][:38]:<38} | {row['val_ex']:>11,.2f} | {'---':>11} | {'manca':>9}")

print('-' * 78)
total_ex = sum(r['val_ex'] for r in rows)
total_crm = sum(r['val_crm'] for r in rows if r['val_crm'] is not None)
print(f"  {'TOTALE RIGHE MATCHATE':<38} | {total_ex:>11,.2f} | {total_crm:>11,.2f} | {total_crm-total_ex:>+9,.2f}")

print()
if only_crm:
    print("PRESENTI NEL CRM MA NON IN EXCEL:")
    for nome, imp in sorted(only_crm, key=lambda x: -x[1]):
        print(f"  {nome[:50]:<50} | EUR {imp:>10,.2f}")
