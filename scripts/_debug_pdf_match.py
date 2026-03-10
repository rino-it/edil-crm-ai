"""Debug: mostra per ogni PDF non associato perche' non matcha."""
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
from supabase import create_client

sb = create_client(os.getenv("NEXT_PUBLIC_SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

XML_DIR = Path(r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_Fatto")
PDF_DIR = Path(r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_pdf")

def estrai_pattern(filename):
    m = re.search(r"_N\.(.+?)_del_(\d{2}-\d{2}-\d{4})_", filename)
    if m: return m.group(1), m.group(2)
    return None, None

def leggi_numero_xml(xml_path):
    try:
        tree = ET.parse(str(xml_path))
        for elem in tree.getroot().iter():
            tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag == "Numero" and elem.text:
                return elem.text.strip()
    except: pass
    return None

# Build XML index
xml_index = {}
for xf in XML_DIR.glob("*.xml"):
    num, data = estrai_pattern(xf.name)
    if num and data:
        xml_index[(num, data)] = xf

# Scan PDFs
pdfs = list(PDF_DIR.glob("*.pdf")) + list(PDF_DIR.glob("*.PDF"))
pdfs = list({p.resolve(): p for p in pdfs}.values())

no_match = []
matched = []
for pdf in sorted(pdfs):
    num, data = estrai_pattern(pdf.name)
    if not num: continue

    parts = data.split("-")
    data_iso = f"{parts[2]}-{parts[1]}-{parts[0]}"

    xml_path = xml_index.get((num, data))
    numero_reale = leggi_numero_xml(xml_path) if xml_path else num

    # Check DB
    r1 = sb.table("scadenze_pagamento") \
        .select("id, fattura_riferimento, data_emissione, file_url") \
        .eq("fattura_riferimento", numero_reale) \
        .eq("data_emissione", data_iso) \
        .execute().data

    has_url = any(s.get('file_url') for s in r1) if r1 else False

    if r1 and not has_url:
        matched.append((pdf.name, numero_reale, data_iso, "MATCH (senza URL)"))
    elif r1 and has_url:
        matched.append((pdf.name, numero_reale, data_iso, "GIA ASSOCIATO"))
    else:
        # Check se fattura esiste in fatture_fornitori
        r2 = sb.table("fatture_fornitori") \
            .select("id, numero_fattura, data_fattura") \
            .eq("numero_fattura", numero_reale) \
            .eq("data_fattura", data_iso) \
            .execute().data

        fattura_esiste = "SI" if r2 else "NO"
        no_match.append((pdf.name, numero_reale, data_iso, fattura_esiste))

try:
    print(f"\n=== PDF GIA ASSOCIATI O CON MATCH: {len(matched)} ===")
    for name, num, data, note in matched[:10]:
        print(f"  {name[:60]:<60} fatt={num:<25} {data} {note}")

    print(f"\n=== PDF SENZA SCADENZA: {len(no_match)} ===")
    print(f"{'PDF':<60} {'Numero fattura':<25} {'Data':<12} {'In fatture_fornitori?'}")
    print(f"{'-'*60} {'-'*25} {'-'*12} {'-'*20}")
    for name, num, data, fat_esiste in no_match:
        print(f"  {name[:58]:<58} {num:<25} {data} {fat_esiste}")
except UnicodeEncodeError:
    print("(encoding error in output)")
