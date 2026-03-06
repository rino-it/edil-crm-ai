import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/utils/supabase/server";
import { EDILCRM_KNOWLEDGE_BASE } from "@/utils/ai/knowledge-base";

interface ChatGuidaResponse {
  reply: string;
  link?: string;
  linkLabel?: string;
  steps?: string[];
}

interface ChatHistoryItem {
  role?: string;
  text?: string;
}

const SYSTEM_PROMPT = `Sei "EdilCRM Assistant", consulente operativo esperto della webapp EdilCRM per utenti amministrativi di un CRM edilizia.

OBIETTIVO:
- Capire cosa vuole fare l'utente.
- Indicare la pagina giusta in EdilCRM.
- Fornire istruzioni pratiche, aggiornate, precise ed eseguibili.
- Quando utile, spiegare i passaggi in ordine.

REGOLE:
- Rispondi in italiano chiaro e concreto.
- Se la richiesta è ambigua, scegli l'interpretazione più probabile e dichiaralo in breve.
- Non inventare pagine o funzionalità non presenti nella knowledge base.
- Se l'utente è già sulla pagina corretta, dillo chiaramente.
- Se la domanda è procedurale, fornisci 2-5 passaggi nel campo steps.
- Se la domanda riguarda dove fare una certa operazione, indica sempre la rotta più precisa disponibile.
- Usa la cronologia conversazionale per capire il contesto implicito.
- Se serve un ID non noto, usa link con placeholder (es: /cantieri/{id}).
- Output SOLO JSON valido con questo schema:
  {"reply":"...","link":"/percorso-opzionale","linkLabel":"Etichetta opzionale","steps":["passo 1","passo 2"]}
- Se non hai un link utile, ometti link e linkLabel.
- Se non servono istruzioni passo-passo, ometti steps.

${EDILCRM_KNOWLEDGE_BASE}
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
    const safeSteps = Array.isArray(parsed.steps)
      ? parsed.steps.filter((step): step is string => typeof step === "string" && step.trim().length > 0).map((step) => step.trim()).slice(0, 5)
      : undefined;

    return {
      reply: safeReply,
      ...(safeLink ? { link: safeLink } : {}),
      ...(safeLink && safeLabel ? { linkLabel: safeLabel } : {}),
      ...(safeSteps && safeSteps.length > 0 ? { steps: safeSteps } : {}),
    };
  } catch {
    return null;
  }
}

function sanitizeHistory(history: unknown): ChatHistoryItem[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item): item is ChatHistoryItem => typeof item === "object" && item !== null)
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      text: typeof item.text === "string" ? item.text.trim() : "",
    }))
    .filter((item) => item.text && item.text.length > 0)
    .slice(-12);
}

function buildPrompt(message: string, currentPath?: string, history: ChatHistoryItem[] = []) {
  const historyBlock = history.length > 0
    ? history.map((item) => `${item.role === "assistant" ? "Assistant" : "Utente"}: ${item.text}`).join("\n")
    : "Nessuna cronologia disponibile.";

  return `${SYSTEM_PROMPT}

CONTESTO CORRENTE:
- Pagina attuale utente: ${currentPath || "non disponibile"}

CRONOLOGIA RECENTE:
${historyBlock}

ULTIMA DOMANDA UTENTE:
Utente: "${message}"
`;
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

    const body = (await req.json()) as { message?: string; history?: unknown; currentPath?: unknown };
    const message = body?.message?.trim();
    const currentPath = typeof body?.currentPath === "string" ? body.currentPath.trim() : undefined;
    const history = sanitizeHistory(body?.history);

    if (!message) {
      return NextResponse.json({ error: "Messaggio mancante" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY non configurata" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = buildPrompt(message, currentPath, history);

    const result = await model.generateContent(prompt);
    const rawText = result.response.text() || "";

    const parsed = parseModelJson(rawText);

    if (!parsed) {
      return NextResponse.json({
        reply: "Dimmi l'operazione precisa che vuoi fare e ti indico la pagina corretta con i passaggi operativi. Se stai lavorando su titoli, mutui, scadenze o riconciliazione posso guidarti passo per passo.",
        link: currentPath?.startsWith("/") ? currentPath : "/",
        linkLabel: "Resta nella pagina attuale",
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
