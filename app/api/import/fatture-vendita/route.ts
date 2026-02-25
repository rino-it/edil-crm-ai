import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { XMLParser } from "fast-xml-parser";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nessun file caricato." }, { status: 400 });
    }

    // Configurazione del parser XML (rimuove i namespace fastidiosi come p:FatturaElettronica)
    const parser = new XMLParser({
      ignoreAttributes: true,
      removeNSPrefix: true,
    });

    const risultati = { success: 0, skipped: 0, errors: [] as string[] };

    for (const file of files) {
      try {
        const xmlString = await file.text();
        const jsonObj = parser.parse(xmlString);

        // 1. Navigazione base FatturaPA
        const fatturaElettronica = jsonObj.FatturaElettronica;
        if (!fatturaElettronica) throw new Error("Formato XML non valido o non è una FatturaPA");

        const header = fatturaElettronica.FatturaElettronicaHeader;
        
        // Gestione di body multipli (raro ma possibile in FatturaPA)
        const rawBody = fatturaElettronica.FatturaElettronicaBody;
        const bodies = Array.isArray(rawBody) ? rawBody : [rawBody];
        const mainBody = bodies[0];

        // 2. Estrazione Cliente (CessionarioCommittente)
        const committente = header.CessionarioCommittente.DatiAnagrafici;
        const pivaCliente = committente.IdFiscaleIVA?.IdCodice || "";
        const cfCliente = committente.CodiceFiscale || "";
        
        const anagrafica = committente.Anagrafica;
        const ragioneSociale = anagrafica.Denominazione || `${anagrafica.Nome || ''} ${anagrafica.Cognome || ''}`.trim();

        // --- UPSERT SOGGETTO ---
        let soggettoId = null;
        const { data: existingSoggetto } = await supabase
          .from("anagrafica_soggetti")
          .select("id")
          .eq("partita_iva", pivaCliente)
          .single();

        if (existingSoggetto) {
          soggettoId = existingSoggetto.id;
        } else {
          const { data: newSoggetto, error: errSog } = await supabase
            .from("anagrafica_soggetti")
            .insert({
              ragione_sociale: ragioneSociale,
              partita_iva: pivaCliente,
              codice_fiscale: cfCliente,
              tipo: "cliente"
            })
            .select("id")
            .single();
            
          if (errSog) throw new Error(`Errore creazione cliente: ${errSog.message}`);
          soggettoId = newSoggetto.id;
        }

        // 3. Dati Generali Fattura
        const datiGeneraliDoc = mainBody.DatiGenerali.DatiGeneraliDocumento;
        const numeroFattura = String(datiGeneraliDoc.Numero);
        const dataFattura = datiGeneraliDoc.Data;
        const importoTotale = parseFloat(datiGeneraliDoc.ImportoTotaleDocumento || "0");

        // --- CONTROLLO DUPLICATI ---
        const { data: existingFattura } = await supabase
          .from("fatture_vendita")
          .select("id")
          .eq("numero_fattura", numeroFattura)
          .eq("soggetto_id", soggettoId)
          .single();

        if (existingFattura) {
          risultati.skipped++;
          continue; // Salta alla prossima fattura
        }

        // --- INSERT FATTURA VENDITA ---
        const { data: newFattura, error: errFatt } = await supabase
          .from("fatture_vendita")
          .insert({
            ragione_sociale: ragioneSociale,
            piva_cliente: pivaCliente,
            numero_fattura: numeroFattura,
            data_fattura: dataFattura,
            importo_totale: importoTotale,
            soggetto_id: soggettoId,
            nome_file_xml: file.name
          })
          .select("id")
          .single();

        if (errFatt) throw new Error(`Errore insert fattura: ${errFatt.message}`);
        const fatturaId = newFattura.id;

        // 4. Estrazione DDT e Righe
        const datiDDT = mainBody.DatiGenerali.DatiDDT;
        let numeroDDT = null;
        if (datiDDT) {
          numeroDDT = Array.isArray(datiDDT) ? datiDDT[0].NumeroDDT : datiDDT.NumeroDDT;
        }

        const righeRaw = mainBody.DatiBeniServizi.DettaglioLinee;
        const righeArray = Array.isArray(righeRaw) ? righeRaw : [righeRaw];
        
        const righeDaInserire = righeArray.map((r: any) => ({
          fattura_id: fatturaId,
          descrizione: r.Descrizione,
          quantita: parseFloat(r.Quantita || "1"),
          prezzo_unitario: parseFloat(r.PrezzoUnitario || "0"),
          importo: parseFloat(r.PrezzoTotale || "0"),
          codice_articolo: r.CodiceValore ? (Array.isArray(r.CodiceValore) ? r.CodiceValore[0].ValoreCodice : r.CodiceValore.ValoreCodice) : null,
          ddt_riferimento: numeroDDT
        }));

        await supabase.from("fatture_vendita_righe").insert(righeDaInserire);

        // 5. Scadenza Pagamento
        const datiPagamentoRaw = mainBody.DatiPagamento;
        let dataScadenza = null;
        
        if (datiPagamentoRaw) {
          const pag = Array.isArray(datiPagamentoRaw) ? datiPagamentoRaw[0] : datiPagamentoRaw;
          const dett = Array.isArray(pag.DettaglioPagamento) ? pag.DettaglioPagamento[0] : pag.DettaglioPagamento;
          dataScadenza = dett.DataScadenzaPagamento;
        }

        // Fallback: se manca la scadenza, aggiungiamo 30gg alla data fattura
        if (!dataScadenza) {
          const d = new Date(dataFattura);
          d.setDate(d.getDate() + 30);
          dataScadenza = d.toISOString().split('T')[0];
        }

        // --- INSERT SCADENZA (Da Incassare) ---
        const { data: newScadenza, error: errScad } = await supabase
          .from("scadenze_pagamento")
          .insert({
            soggetto_id: soggettoId,
            fattura_vendita_id: fatturaId,
            fattura_riferimento: numeroFattura,
            importo_totale: importoTotale,
            importo_pagato: 0,
            data_emissione: dataFattura,
            data_scadenza: dataScadenza,
            tipo: "entrata",
            stato: "da_pagare",
            descrizione: `Fattura di Vendita n. ${numeroFattura}`
          })
          .select("id")
          .single();

        if (errScad) throw new Error(`Errore insert scadenza: ${errScad.message}`);

        // Aggiorna la fattura con il link alla scadenza
        await supabase
          .from("fatture_vendita")
          .update({ scadenza_id: newScadenza.id })
          .eq("id", fatturaId);

        risultati.success++;

      } catch (fileErr: any) {
        console.error(`Errore file ${file.name}:`, fileErr);
        risultati.errors.push(`File ${file.name}: ${fileErr.message}`);
      }
    }

    return NextResponse.json(risultati);

  } catch (error: any) {
    console.error("Errore fatale API import:", error);
    return NextResponse.json({ error: "Errore durante l'elaborazione della richiesta." }, { status: 500 });
  }
}