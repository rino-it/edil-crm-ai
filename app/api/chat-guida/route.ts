import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/utils/supabase/server";

interface ChatGuidaResponse {
  reply: string;
  link?: string;
  linkLabel?: string;
}

const APP_MAP = `
Mappa EdilCRM (route -> funzione):
1) / -> Dashboard generale operativa
2) /login -> Accesso utenti
3) /cantieri -> Lista cantieri, filtri, accesso rapido al dettaglio
4) /cantieri/nuovo -> Creazione nuovo cantiere
5) /cantieri/{id} -> Dettaglio cantiere: KPI, presenze, acquisti, accessi rapidi
6) /cantieri/{id}/spesa -> Registra nuova spesa/DDT/materiale per cantiere
7) /cantieri/{id}/computo -> Computo metrico e voci lavorazioni
8) /cantieri/{id}/archivio -> Archivio documenti cantiere
9) /personale -> Lista dipendenti + form nuovo lavoratore
10) /personale/{id} -> Dettaglio lavoratore
11) /personale/{id}/documenti -> Upload documenti con analisi AI
12) /anagrafiche -> Elenco fornitori/clienti con filtri e ricerca
13) /anagrafiche/{id} -> Dettaglio anagrafica con storico economico
14) /scadenze -> Hub scadenziario con KPI
15) /scadenze/da-pagare -> Scadenze in uscita da pagare
16) /scadenze/da-incassare -> Scadenze in entrata da incassare
17) /scadenze/scadute -> Scadenze scadute da gestire
18) /scadenze/da-smistare -> Fatture da associare a cantiere
19) /scadenze/pagate -> Storico movimenti chiusi
20) /finanza -> Dashboard finanziaria: cashflow, aging, margini
21) /finanza/programmazione -> Simulatore cashflow 90 giorni
22) /finanza/importa-fatture -> Import XML FatturaPA
23) /finanza/riconciliazione -> Conti banca + riconciliazione AI
24) /finanza/da-incassare -> Focus crediti aperti
25) /finanza/da-pagare -> Focus debiti aperti
`;

const SYSTEM_PROMPT = `Sei "EdilCRM Assistant", guida operativa per utenti amministrativi di un CRM edilizia.

OBIETTIVO:
- Capire cosa vuole fare l'utente.
- Indicare la pagina giusta in EdilCRM.
- Dare un micro-suggerimento pratico su come completare l'operazione.

REGOLE:
- Rispondi in italiano semplice, massimo 3 frasi.
- Se la richiesta è ambigua, scegli la rotta più probabile e spiegalo in breve.
- Non inventare pagine non presenti nella mappa.
- Se serve un ID non noto, usa link con placeholder (es: /cantieri/{id}).
- Output SOLO JSON valido con questo schema:
  {"reply":"...","link":"/percorso-opzionale","linkLabel":"Etichetta opzionale"}
- Se non hai un link utile, ometti link e linkLabel.

${APP_MAP}
`;

function stripCodeFences(value: string): string {
  return value.replace(/```json\s*|```\s*/gi, "").trim();
}

function normalizeLink(link: unknown): string | undefined {
  if (typeof link !== "string") return undefined;
  const trimmed = link.trim();
  if (!trimmed.startsWith("/")) return undefined;
  return trimmed;
}

function parseModelJson(text: string): ChatGuidaResponse | null {
  try {
    const parsed = JSON.parse(stripCodeFences(text)) as Partial<ChatGuidaResponse>;

    if (!parsed || typeof parsed.reply !== "string" || parsed.reply.trim().length === 0) {
      return null;
    }

    const safeReply = parsed.reply.trim();
    const safeLink = normalizeLink(parsed.link);
    const safeLabel = typeof parsed.linkLabel === "string" ? parsed.linkLabel.trim() : undefined;

    return {
      reply: safeReply,
      ...(safeLink ? { link: safeLink } : {}),
      ...(safeLink && safeLabel ? { linkLabel: safeLabel } : {}),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = (await req.json()) as { message?: string };
    const message = body?.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Messaggio mancante" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY non configurata" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `${SYSTEM_PROMPT}\nUtente: "${message}"`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text() || "";

    const parsed = parseModelJson(rawText);

    if (!parsed) {
      return NextResponse.json({
        reply: "Ti consiglio di partire da /finanza o /scadenze in base all'operazione. Se vuoi, descrivi in una frase l'obiettivo e ti porto alla pagina esatta.",
        link: "/finanza",
        linkLabel: "Apri Dashboard Finanza",
      });
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Errore /api/chat-guida:", error);
    return NextResponse.json(
      { error: "Errore interno durante la generazione della guida" },
      { status: 500 }
    );
  }
}
