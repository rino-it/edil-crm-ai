import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { matchBatchRiconciliazioneBancaria } from "@/utils/ai/gemini";

export async function POST(request: Request) {
  try {
    const { movimenti } = await request.json();

    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      return NextResponse.json({ error: "Nessun movimento fornito per l'analisi." }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Scarichiamo le scadenze aperte
    const { data: scadenzeAperte, error } = await supabase
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, anagrafica_soggetti(ragione_sociale)')
      .neq('stato', 'pagato');

    if (error) throw new Error(`Errore DB: ${error.message}`);

    if (!scadenzeAperte || scadenzeAperte.length === 0) {
      return NextResponse.json({ risultati: [] });
    }

    // 2. Chiamata a Gemini per QUESTO specifico blocco (massimo 10 movimenti, impiega 2-3 secondi)
    const risultatiChunk = await matchBatchRiconciliazioneBancaria(movimenti, scadenzeAperte);
    
    const risultatiDaSalvare = Array.isArray(risultatiChunk) ? risultatiChunk : [];

    // 3. Salvataggio immediato sul Database
    for (const res of risultatiDaSalvare) {
      if (res.scadenza_id) {
        await supabase
          .from('movimenti_banca')
          .update({
            ai_suggerimento: res.scadenza_id,
            ai_confidence: res.confidence,
            ai_motivo: res.motivo
          })
          .eq('id', res.movimento_id);
      }
    }

    return NextResponse.json({ success: true, risultati: risultatiDaSalvare });

  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json({ error: error.message || "Errore interno" }, { status: 500 });
  }
}