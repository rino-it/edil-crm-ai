// ============================================================
// ROUTE: /api/preventivo/match
// METODO: POST
// DESCRIZIONE: Riceve una descrizione, estrae il contesto dal DB (Prezziario + Storico)
// e chiede a Gemini di generare una stima dei costi.
// ============================================================

import { NextResponse } from "next/server";
import { getPrezziarioForRAG, getStoricoForRAG } from "@/utils/data-fetcher";
import { matchSemanticoPrezziario } from "@/utils/ai/gemini";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { descrizione, unita_misura } = body;

    if (!descrizione) {
      return NextResponse.json(
        { error: "Descrizione lavorazione mancante." },
        { status: 400 }
      );
    }

    console.log(`🔍 RAG Matcher avviato per: "${descrizione}"`);

    // 1. Fetch contesto dal Database
    const [contextPrezziario, contextStorico] = await Promise.all([
      getPrezziarioForRAG(descrizione),
      getStoricoForRAG(descrizione),
    ]);

    // 2. Chiamata a Gemini per l'analisi semantica
    const matchResult = await matchSemanticoPrezziario(
      descrizione,
      unita_misura || null,
      contextPrezziario,
      contextStorico
    );

    // 3. Ritorna il risultato al client
    return NextResponse.json({
      success: true,
      data: matchResult,
      meta: {
        prezziario_trovato: contextPrezziario !== "",
        storico_trovato: contextStorico !== ""
      }
    });

  } catch (error: any) {
    console.error("🔥 Errore Route API /preventivo/match:", error.message);
    return NextResponse.json(
      { error: "Errore durante l'analisi del preventivo." },
      { status: 500 }
    );
  }
}