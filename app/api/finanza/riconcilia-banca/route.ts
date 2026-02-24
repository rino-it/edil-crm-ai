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
    
    // 2. Estrai Anagrafica Fornitori/Clienti
    const { data: soggetti, error: errorSoggetti } = await supabase
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale, partita_iva, iban');

    if (errorSoggetti) throw new Error(`Errore DB Soggetti: ${errorSoggetti.message}`);

    // 3. Estrai Personale (Per gli Stipendi)
    const { data: personale, error: errorPersonale } = await supabase
      .from('personale')
      .select('id, nome, iban');

    if (errorPersonale) console.error("❌ Errore Personale:", errorPersonale);

    // 4. Estrai Conti Banca Aziendali (Per i Giroconti)
    const { data: conti_banca, error: errorConti } = await supabase
      .from('conti_banca')
      .select('id, nome_banca, iban');

    // Definiamo le variabili "Safe" (una sola volta per ciascuna)
    const scadenzeSafe = scadenzeAperte || [];
    const soggettiSafe = soggetti || [];
    const personaleSafe = personale || [];
    const contiSafe = conti_banca || [];

    // ==========================================
    // FASE A: Pre-Match Deterministico Veloce
    // ==========================================
    // FIX: Chiusa correttamente la parentesi );
    const { matchati, nonMatchati } = await preMatchMovimenti(
      movimenti, 
      scadenzeSafe, 
      soggettiSafe, 
      personaleSafe, 
      contiSafe
    );
    
    // ==========================================
    // FASE B: AI Fallback (Gemini) solo sui residui
    // ==========================================
    let risultatiAI: any[] = [];
    if (nonMatchati.length > 0) {
      console.log(`🤖 Invio di ${nonMatchati.length} movimenti all'AI...`);
      const startTime = Date.now();
      
      const risultatiChunk = await matchBatchRiconciliazioneBancaria(nonMatchati, scadenzeSafe);
      risultatiAI = Array.isArray(risultatiChunk) ? risultatiChunk : [];

      const tempoImpiegato = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`🤖 Risposta AI ricevuta in ${tempoImpiegato} secondi.`);

      risultatiAI = risultatiAI.map(res => {
        if (res.soggetto_id && !res.ragione_sociale) {
          const s = soggettiSafe.find(sog => sog.id === res.soggetto_id);
          if (s) res.ragione_sociale = s.ragione_sociale;
        }
        // I risultati passati dall'AI sono considerati di default fatture
        res.categoria = 'fattura';
        return res;
      });
    } else {
      console.log(`⏭️ Nessun movimento per l'AI. Salto chiamata Gemini.`);
    }

    // Combiniamo i risultati veloci con quelli dell'AI
    const risultatiDaSalvare = [...matchati, ...risultatiAI];
    
    // ==========================================
    // SALVATAGGIO IN PARALLELO
    // ==========================================
    await Promise.all(
      risultatiDaSalvare.map((res) => 
        supabase
          .from('movimenti_banca')
          .update({
            ai_suggerimento: res.scadenza_id || null,
            soggetto_id: res.soggetto_id || null,
            personale_id: res.personale_id || null,           
            categoria_dedotta: res.categoria || null,         
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