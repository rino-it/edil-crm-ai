import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const titolo = searchParams.get("titolo") ?? "Scadenza Documento";
  const data = searchParams.get("data"); // atteso formato YYYY-MM-DD
  const cantiere = searchParams.get("cantiere"); // parametro opzionale aggiunto

  if (!data) {
    return NextResponse.json(
      { error: "Parametro 'data' obbligatorio (formato YYYY-MM-DD)" },
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
  const uid = `scadenza-${dataIcs}-${Date.now()}@edil-crm`;

  // Costruzione stringhe dinamiche per il calendario
  const summaryPrefix = cantiere ? `[${cantiere}] ` : "";
  const descrizioneCantiere = cantiere ? `\nRiferimento Cantiere: ${cantiere}` : "";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EdilCRM//Scadenze Documenti//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dataIcs}`,
    `DTEND;VALUE=DATE:${dataIcs}`,
    `SUMMARY:⚠️ Scadenza: ${summaryPrefix}${titolo}`,
    `DESCRIPTION:Il documento "${titolo}" scade in questa data.${descrizioneCantiere}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Promemoria scadenza: ${titolo}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const nomeFile = `scadenza-${titolo.replace(/\s+/g, "-").toLowerCase()}.ics`;

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      // Header fondamentale per Apple
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
      // Questi due header dicono all'iPhone di non mettere il file in cache e di trattarlo come nuovo
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}