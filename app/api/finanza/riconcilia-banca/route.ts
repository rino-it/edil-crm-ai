import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { matchBatchRiconciliazioneBancaria } from "@/utils/ai/gemini";
import { preMatchMovimenti } from "@/utils/data-fetcher";

// FIX TIMEOUT: Concede fino a 60 secondi per questa API su Vercel
export const maxDuration = 60; 

export async function POST(request: Request) {
  try {
    const { movimenti } = await request.json();
    
    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      return NextResponse.json(
        { error: "Nessun movimento fornito per l'analisi." }, 
        { status: 400 }
      );
    }
    
    const supabase = await createClient();
    
    // ========================================================================
    // 1. FASE DETERMINISTICA (Regole, Regex e Text Search locale)
    // ========================================================================
    const { matchati, nonMatchati } = await preMatchMovimenti(movimenti);
    
    let risultatiAI: any[] = [];
    
    // ========================================================================
    // 2. FASE AI FALLBACK (Solo per i movimenti non risolti)
    // ========================================================================
    if (nonMatchati.length > 0) {
      // Recuperiamo le scadenze aperte solo se serve chiamare Gemini
      const { data: scadenzeAperte, error } = await supabase
        .from('scadenze_pagamento')
        .select('id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, soggetto_id, descrizione, anagrafica_soggetti(ragione_sociale, partita_iva, iban)')
        .neq('stato', 'pagato')
        .order('data_scadenza', { ascending: true });
        
      if (error) throw new Error(`Errore DB: ${error.message}`);
      
      if (scadenzeAperte && scadenzeAperte.length > 0) {
        // Chiamata a Gemini solo con i movimenti "difficili"
        const aiChunk = await matchBatchRiconciliazioneBancaria(nonMatchati, scadenzeAperte);
        risultatiAI = Array.isArray(aiChunk) ? aiChunk : [];
        
        // Salvataggio parallelo SOLO per i risultati AI (il pre-match salva da solo)
        await Promise.all(
          risultatiAI.map((res) => 
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
      }
    }
    
    // ========================================================================
    // 3. MERGE DEI RISULTATI E RISPOSTA AL CLIENT
    // ========================================================================
    const risultatiCombinati = [...matchati, ...risultatiAI];
    
    return NextResponse.json({ success: true, risultati: risultatiCombinati });
    
  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json(
      { error: error.message || "Errore interno" }, 
      { status: 500 }
    );
  }
}