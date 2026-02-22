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

    // 1. Scarichiamo TUTTE le scadenze aperte una sola volta per non stressare il database
    const { data: scadenzeAperte, error } = await supabase
      .from('scadenze_pagamento')
      .select(`
        id,
        fattura_riferimento,
        importo_totale,
        importo_pagato,
        data_scadenza,
        tipo,
        anagrafica_soggetti(ragione_sociale)
      `)
      .neq('stato', 'pagato');

    if (error) throw new Error(`Errore DB: ${error.message}`);

    if (!scadenzeAperte || scadenzeAperte.length === 0) {
      return NextResponse.json({ 
        risultati: movimenti.map(m => ({
          movimento_id: m.id,
          scadenza_id: null,
          confidence: 0,
          motivo: "Nessuna scadenza aperta nel database per fare il match."
        }))
      });
    }

    // 2. Elaborazione in CHUNK (Batch) per aggirare l'errore 429 (Too Many Requests)
    const CHUNK_SIZE = 10;
    const risultatiTotali = [];

    for (let i = 0; i < movimenti.length; i += CHUNK_SIZE) {
      const chunk = movimenti.slice(i, i + CHUNK_SIZE);
      
      // Chiamata Batch a Gemini - Passiamo tutte le scadenze, Gemini le abbinerà in base al segno (+ o -)
      const risultatiChunk = await matchBatchRiconciliazioneBancaria(chunk, scadenzeAperte);
      
      // Controllo di sicurezza strutturale
      if (Array.isArray(risultatiChunk)) {
          risultatiTotali.push(...risultatiChunk);
      } else {
          chunk.forEach(m => risultatiTotali.push({ 
            movimento_id: m.id, 
            scadenza_id: null, 
            confidence: 0, 
            motivo: "Errore nel formato della risposta AI per questo blocco." 
          }));
      }

      // 3. Pausa Tattica: Attendiamo 12 secondi tra un blocco e l'altro per rispettare la quota di Gemini (max 5 req/min)
      if (i + CHUNK_SIZE < movimenti.length) {
        await new Promise(resolve => setTimeout(resolve, 12000));
      }
    }

    // 4. Aggiorniamo il database in modo che i suggerimenti rimangano salvati
    for (const res of risultatiTotali) {
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

    return NextResponse.json({ risultati: risultatiTotali });

  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json({ error: error.message || "Errore interno del server" }, { status: 500 });
  }
}