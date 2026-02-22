import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { matchBatchRiconciliazioneBancaria } from "@/utils/ai/gemini";

export async function POST(request: Request) {
  try {
    const { movimenti } = await request.json();

    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      return NextResponse.json({ error: "Nessun movimento fornito per l'analisi." }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // FIX 0.1 A: Determina se il chunk contiene uscite, entrate, o miste
    const haUscite = movimenti.some((m: any) => m.importo < 0);
    const haEntrate = movimenti.some((m: any) => m.importo > 0);

    let query = supabase
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, soggetto_id, descrizione, anagrafica_soggetti(ragione_sociale)')
      .neq('stato', 'pagato')
      .order('data_scadenza', { ascending: true })
      .limit(30);

    // Applica il filtro solo se il blocco è "puro" (solo entrate o solo uscite)
    if (haUscite && !haEntrate) query = query.eq('tipo', 'uscita');
    if (haEntrate && !haUscite) query = query.eq('tipo', 'entrata');

    const { data: scadenzeAperte, error } = await query;

    if (error) throw new Error(`Errore DB: ${error.message}`);

    if (!scadenzeAperte || scadenzeAperte.length === 0) {
      return NextResponse.json({ risultati: [] });
    }

    // Chiamata a Gemini per QUESTO specifico blocco (ora i dati passati sono pochissimi)
    const risultatiChunk = await matchBatchRiconciliazioneBancaria(movimenti, scadenzeAperte);
    const risultatiDaSalvare = Array.isArray(risultatiChunk) ? risultatiChunk : [];

    // Salvataggio immediato sul Database
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