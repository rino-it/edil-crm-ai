"""
Arricchisce anagrafica_soggetti estraendo dati dai file XML
di entrambe le cartelle (Archivio_Fatto + archivio_xml_2024).

Per ogni fornitore trovato negli XML, popola SOLO i campi
attualmente vuoti: indirizzo, codice_fiscale, email, telefono, pec, iban.
Non sovrascrive mai dati esistenti.
"""
import os
import re
import sys
import xml.etree.ElementTree as ET
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="../.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CARTELLE = [
    r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\Archivio_Fatto",
    r"\\192.168.1.231\scambio\AMMINISTRAZIONE\Clienti e Fornitori\2025\contabilità\archivio_xml_2024",
]

DRY_RUN = "--execute" not in sys.argv


def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode())


def pulisci_namespace(xml_content):
    xml_content = re.sub(r'\sxmlns="[^"]+"', '', xml_content, count=1)
    xml_content = re.sub(r'(<\/?)[a-zA-Z0-9]+:', r'\1', xml_content)
    return xml_content


def estrai_dati_fornitore(percorso_file):
    """Estrae dati anagrafici dal CedentePrestatore dell'XML."""
    try:
        with open(percorso_file, "r", encoding="utf-8", errors="ignore") as f:
            xml_raw = f.read()

        xml_clean = pulisci_namespace(xml_raw)
        root = ET.fromstring(xml_clean)

        header = root.find(".//FatturaElettronicaHeader")
        body = root.find(".//FatturaElettronicaBody")
        if header is None:
            return None

        cedente = header.find(".//CedentePrestatore")
        if cedente is None:
            return None

        anag = cedente.find(".//DatiAnagrafici")
        if anag is None:
            return None

        # PIVA (chiave di match)
        id_fiscale = anag.find(".//IdFiscaleIVA/IdCodice")
        piva = id_fiscale.text.strip() if id_fiscale is not None and id_fiscale.text else None
        if not piva:
            return None

        dati = {"piva": piva}

        # Codice fiscale
        cf_tag = anag.find("CodiceFiscale")
        if cf_tag is not None and cf_tag.text:
            dati["codice_fiscale"] = cf_tag.text.strip()

        # Sede
        sede = cedente.find("Sede")
        if sede is not None:
            parti = []
            indirizzo_tag = sede.find("Indirizzo")
            if indirizzo_tag is not None and indirizzo_tag.text:
                parti.append(indirizzo_tag.text.strip())
            cap_tag = sede.find("CAP")
            comune_tag = sede.find("Comune")
            prov_tag = sede.find("Provincia")
            loc = []
            if cap_tag is not None and cap_tag.text:
                loc.append(cap_tag.text.strip())
            if comune_tag is not None and comune_tag.text:
                loc.append(comune_tag.text.strip())
            if prov_tag is not None and prov_tag.text:
                loc.append(f"({prov_tag.text.strip()})")
            if loc:
                parti.append(" ".join(loc))
            if parti:
                dati["indirizzo"] = ", ".join(parti)

        # Contatti
        contatti = cedente.find("Contatti")
        if contatti is not None:
            email_tag = contatti.find("Email")
            if email_tag is not None and email_tag.text:
                val = email_tag.text.strip().lower()
                if "@" in val:
                    if "pec" in val or "legalmail" in val or "cert" in val:
                        dati["pec"] = val
                    else:
                        dati["email"] = val
            tel_tag = contatti.find("Telefono")
            if tel_tag is not None and tel_tag.text:
                dati["telefono"] = tel_tag.text.strip()
            fax_tag = contatti.find("Fax")
            if fax_tag is not None and fax_tag.text and "telefono" not in dati:
                pass  # ignoriamo fax

        # IBAN dal pagamento
        if body is not None:
            iban_tag = body.find(".//DettaglioPagamento/IBAN")
            if iban_tag is not None and iban_tag.text:
                iban = iban_tag.text.strip().upper().replace(" ", "")
                if len(iban) == 27 and iban.startswith("IT"):
                    dati["iban"] = iban

        # Codice destinatario (SDI) dal committente (noi), non utile per fornitore
        # Ma il CodiceDestinatario nella testata e' il nostro, non il loro

        return dati

    except Exception:
        return None


def main():
    mode = "DRY RUN" if DRY_RUN else "ESECUZIONE"
    safe_print(f"=== ARRICCHIMENTO ANAGRAFICA FORNITORI DA XML - {mode} ===\n")

    # Carica anagrafica attuale
    res = supabase.table("anagrafica_soggetti").select(
        "id, ragione_sociale, partita_iva, codice_fiscale, indirizzo, email, telefono, pec, iban"
    ).eq("tipo", "fornitore").execute()

    fornitori_db = {r["partita_iva"]: r for r in (res.data or []) if r.get("partita_iva")}
    safe_print(f"Fornitori in DB (con PIVA): {len(fornitori_db)}\n")

    # Accumula dati da XML (ultimo vince, ma non sovrascrive)
    dati_xml = {}
    file_count = 0

    for cartella in CARTELLE:
        if not os.path.exists(cartella):
            safe_print(f"[WARN] Cartella non trovata: {cartella}")
            continue

        files = [f for f in os.listdir(cartella) if f.lower().endswith(".xml")]
        safe_print(f"Scansione {os.path.basename(cartella)}: {len(files)} XML")

        for fname in files:
            dati = estrai_dati_fornitore(os.path.join(cartella, fname))
            if not dati:
                continue
            file_count += 1
            piva = dati.pop("piva")

            if piva not in dati_xml:
                dati_xml[piva] = {}

            # Accumula: primo valore trovato vince (non sovrascrivere)
            for campo, valore in dati.items():
                if campo not in dati_xml[piva]:
                    dati_xml[piva][campo] = valore

    safe_print(f"\nXML processati con dati validi: {file_count}")
    safe_print(f"PIVA distinte trovate: {len(dati_xml)}\n")

    # Confronta e aggiorna
    aggiornati = 0
    campi_aggiornati = {"codice_fiscale": 0, "indirizzo": 0, "email": 0, "telefono": 0, "pec": 0, "iban": 0}

    for piva, dati_nuovi in sorted(dati_xml.items()):
        fornitore = fornitori_db.get(piva)
        if not fornitore:
            continue

        update = {}
        for campo in ["codice_fiscale", "indirizzo", "email", "telefono", "pec", "iban"]:
            valore_db = fornitore.get(campo)
            valore_xml = dati_nuovi.get(campo)
            if not valore_db and valore_xml:
                update[campo] = valore_xml
                campi_aggiornati[campo] += 1

        if update:
            nome = fornitore.get("ragione_sociale", "?")
            campi_str = ", ".join(f"{k}={v[:30]}" for k, v in update.items())
            safe_print(f"  {nome[:45]:<45} <- {campi_str}")

            if not DRY_RUN:
                supabase.table("anagrafica_soggetti").update(update).eq("id", fornitore["id"]).execute()

            aggiornati += 1

    safe_print(f"\n{'='*60}")
    safe_print(f"  RIEPILOGO ({mode})")
    safe_print(f"{'='*60}")
    safe_print(f"  Fornitori aggiornati: {aggiornati}")
    for campo, n in sorted(campi_aggiornati.items(), key=lambda x: -x[1]):
        if n > 0:
            safe_print(f"    {campo:<20} +{n}")

    if DRY_RUN:
        safe_print(f"\n  Per eseguire: python arricchisci_anagrafica_da_xml.py --execute")


if __name__ == "__main__":
    main()
