import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/server';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  
  // Parametri opzionali legacy o diretti
  let titolo = searchParams.get("titolo") ?? "Scadenza Finanziaria";
  let data = searchParams.get("data"); // atteso formato YYYY-MM-DD
  let cantiere = searchParams.get("cantiere");
  let descrizioneAggiuntiva = "";

  // NUOVO: Supporto diretto tramite scadenzaId
  const scadenzaId = searchParams.get("scadenzaId");

  if (scadenzaId) {
    const supabase = await createClient();
    const { data: scadenza, error } = await supabase
      .from('scadenze_pagamento')
      .select(`
        data_scadenza,
        importo_totale,
        importo_pagato,
        fattura_riferimento,
        tipo,
        anagrafica_soggetti:soggetto_id (ragione_sociale),
        cantieri:cantiere_id (codice, titolo)
      `)
      .eq('id', scadenzaId)
      .single();

    if (!error && scadenza) {
      data = scadenza.data_scadenza;
      
      // Supabase può restituire oggetti o array per le relazioni FK
      const soggettoData = Array.isArray(scadenza.anagrafica_soggetti)
        ? scadenza.anagrafica_soggetti[0]
        : scadenza.anagrafica_soggetti;
      const cantiereData = Array.isArray(scadenza.cantieri)
        ? scadenza.cantieri[0]
        : scadenza.cantieri;
      
      const soggetto = soggettoData?.ragione_sociale || "Soggetto N/D";
      const fattura = scadenza.fattura_riferimento || "Senza Rif.";
      const residuo = Number(scadenza.importo_totale) - Number(scadenza.importo_pagato || 0);
      
      // Formatta il titolo in base al tipo
      const verbo = scadenza.tipo === 'entrata' ? 'Incasso' : 'Pagamento';
      titolo = `${verbo} ${fattura} - ${soggetto}`;
      
      // Costruisce la descrizione dettagliata
      descrizioneAggiuntiva = `\nImporto da saldare: €${residuo.toFixed(2)}\nTipo: ${scadenza.tipo.toUpperCase()}`;
      
      // Associa il cantiere se presente
      if (cantiereData) {
        cantiere = `${cantiereData.codice} - ${cantiereData.titolo}`;
      }
    }
  }

  if (!data) {
    return NextResponse.json(
      { error: "Parametro 'data' o 'scadenzaId' valido obbligatorio." },
      { status: 400 }
    );
  }

  // Costruisce la data come stringa ICS: YYYYMMDD
  const dataIcs = data.replace(/-/g, "");

  // Timestamp di creazione in formato UTC: YYYYMMDDTHHmmssZ
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  // UID univoco per l'evento
  const uid = `scadenza-${scadenzaId || dataIcs}-${Date.now()}@edil-crm`;

  // Costruzione stringhe dinamiche per il calendario
  const summaryPrefix = cantiere ? `[${cantiere.split('-')[0].trim()}] ` : "";
  const stringaCantiere = cantiere ? `\nRiferimento Cantiere: ${cantiere}` : "";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EdilCRM//Scadenze Finanza//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    // Usiamo VALUE=DATE per creare un evento "Tutto il giorno"
    `DTSTART;VALUE=DATE:${dataIcs}`,
    `DTEND;VALUE=DATE:${dataIcs}`,
    `SUMMARY:⚠️ ${summaryPrefix}${titolo}`,
    `DESCRIPTION:Dettagli Scadenza:${descrizioneAggiuntiva}${stringaCantiere}`,
    // --- ALLARME 1: 3 Giorni Prima ---
    "BEGIN:VALARM",
    "TRIGGER:-P3D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Preavviso (-3gg): ${titolo}`,
    "END:VALARM",
    // --- ALLARME 2: 1 Giorno Prima ---
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Domani scade: ${titolo}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const safeFileName = titolo.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const nomeFile = `scadenza-${safeFileName}.ics`;

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}