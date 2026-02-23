import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { matchBatchRiconciliazioneBancaria } from "@/utils/ai/gemini";
import { preMatchMovimenti } from "@/utils/data-fetcher"; 

export const maxDuration = 60; 

export async function POST(request: Request) {
  try {
    const { movimenti } = await request.json();
    
    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      return NextResponse.json({ error: "Nessun movimento fornito per l'analisi." }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // 1. Estrai scadenze aperte
    const { data: scadenzeAperte, error: errorScadenze } = await supabase
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, soggetto_id, descrizione, anagrafica_soggetti(ragione_sociale, partita_iva, iban)')
      .neq('stato', 'pagato')
      .order('data_scadenza', { ascending: true });
      
    if (errorScadenze) throw new Error(`Errore DB Scadenze: ${errorScadenze.message}`);
    
    // 2. Estrai l'Anagrafica completa (Risolve errore TypeScript e Soggetti Fantasma)
    const { data: soggetti, error: errorSoggetti } = await supabase
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale, partita_iva, iban');

    if (errorSoggetti) throw new Error(`Errore DB Soggetti: ${errorSoggetti.message}`);

    const scadenzeSafe = scadenzeAperte || [];
    const soggettiSafe = soggetti || [];

    // ==========================================
    // FASE A: Pre-Match Deterministico Veloce
    // ==========================================
    const { matchati, nonMatchati } = await preMatchMovimenti(movimenti, scadenzeSafe, soggettiSafe);
    console.log(`🔍 Pre-match ha risolto ${matchati.length} movimenti. Ne rimangono ${nonMatchati.length} per l'AI.`);

    // ==========================================
    // FASE B: AI Fallback (Gemini) solo sui residui
    // ==========================================
    let risultatiAI: any[] = [];
    if (nonMatchati.length > 0) {
      const risultatiChunk = await matchBatchRiconciliazioneBancaria(nonMatchati, scadenzeSafe);
      risultatiAI = Array.isArray(risultatiChunk) ? risultatiChunk : [];

      // Aggiungiamo la ragione sociale anche ai risultati di Gemini per la UI (Fix Step 5)
      risultatiAI = risultatiAI.map(res => {
        if (res.soggetto_id && !res.ragione_sociale) {
          const s = soggettiSafe.find(sog => sog.id === res.soggetto_id);
          if (s) res.ragione_sociale = s.ragione_sociale;
        }
        return res;
      });
    }

    // Combiniamo i risultati veloci con quelli dell'AI
    const risultatiDaSalvare = [...matchati, ...risultatiAI];
    
    // Salviamo tutto nel database in PARALLELO (Fondamentale per evitare Timeout su Vercel)
    await Promise.all(
      risultatiDaSalvare.map((res) => 
        supabase
          .from('movimenti_banca')
          .update({
            ai_suggerimento: res.scadenza_id || null,
            soggetto_id: res.soggetto_id || null,
            ai_confidence: res.confidence || 0,
            ai_motivo: res.motivo || "Nessun match trovato"
          })
          .eq('id', res.movimento_id)
      )
    );
    
    return NextResponse.json({ success: true, risultati: risultatiDaSalvare });
  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json({ error: error.message || "Errore interno" }, { status: 500 });
  }
}