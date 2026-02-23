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
    
    // TUTTE le scadenze aperte, senza limit. Gemini 2.5 Flash gestisce 1M token.
    const { data: scadenzeAperte, error } = await supabase
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, soggetto_id, descrizione, anagrafica_soggetti(ragione_sociale, partita_iva)')
      .neq('stato', 'pagato')
      .order('data_scadenza', { ascending: true });
      
    if (error) throw new Error(`Errore DB: ${error.message}`);
    
    if (!scadenzeAperte || scadenzeAperte.length === 0) {
      return NextResponse.json({ risultati: [] });
    }
    
    const risultatiChunk = await matchBatchRiconciliazioneBancaria(movimenti, scadenzeAperte);
    const risultatiDaSalvare = Array.isArray(risultatiChunk) ? risultatiChunk : [];
    
    // Salva TUTTI i risultati (anche quelli senza match)
    for (const res of risultatiDaSalvare) {
      await supabase
        .from('movimenti_banca')
        .update({
          ai_suggerimento: res.scadenza_id || null,
          soggetto_id: res.soggetto_id || null,
          ai_confidence: res.confidence || 0,
          ai_motivo: res.motivo || "Nessun match trovato"
        })
        .eq('id', res.movimento_id);
    }
    
    return NextResponse.json({ success: true, risultati: risultatiDaSalvare });
  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json({ error: error.message || "Errore interno" }, { status: 500 });
  }
}