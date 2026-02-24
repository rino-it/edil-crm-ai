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

    const scadenzeSafe = scadenzeAperte || [];
    const soggettiSafe = soggetti || [];
    const personaleSafe = personale || [];
    const contiSafe = conti_banca || [];

    // Log conteggi (CRITICO per il debug)
    console.log(`📊 CONTEGGI DB: ${scadenzeSafe.length} scadenze totali, ${soggettiSafe.length} soggetti, ${personaleSafe.length} personale`);

    // ==========================================
    // FASE A: Pre-Match Deterministico Veloce
    // ==========================================
    const { matchati, nonMatchati } = await preMatchMovimenti(
      movimenti, 
      scadenzeSafe, 
      soggettiSafe, 
      personaleSafe, 
      contiSafe
    );
    
    // ==========================================
    // FASE B: AI Fallback (Gemini) con Filtro Aggressivo
    // ==========================================
    let risultatiAI: any[] = [];
    if (nonMatchati.length > 0) {
      
      const hasUscite = nonMatchati.some(m => m.importo < 0);
      const hasEntrate = nonMatchati.some(m => m.importo > 0);
      
      // FILTRO INTELLIGENTE AGGRESSIVO (Max 20, priorità fatture)
      const scadenzePerAI = scadenzeSafe
        .filter(s => {
          const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
          if (residuo <= 0) return false;
          if (hasUscite && !hasEntrate && s.tipo === 'entrata') return false;
          if (hasEntrate && !hasUscite && s.tipo === 'uscita') return false;
          return true;
        })
        .sort((a, b) => {
          const aHasFatt = a.fattura_riferimento ? 1 : 0;
          const bHasFatt = b.fattura_riferimento ? 1 : 0;
          return bHasFatt - aHasFatt; // fatture con riferimento prima
        })
        .slice(0, 20); // Limite drastico per abbattere i token
      
      console.log(`🤖 AI: ${nonMatchati.length} mov. da analizzare. Scadenze: ${scadenzePerAI.length}/${scadenzeSafe.length} (filtrate per tipo e priorità fattura)`);
      
      const startTime = Date.now();
      
      // Chiamata all'AI: passiamo i movimenti non matchati, le scadenze filtrate e l'anagrafica completa
      const risultatiChunk = await matchBatchRiconciliazioneBancaria(nonMatchati, scadenzePerAI, soggettiSafe);
      risultatiAI = Array.isArray(risultatiChunk) ? risultatiChunk : [];

      const tempoImpiegato = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`🤖 Risposta AI ricevuta in ${tempoImpiegato} secondi.`);

      risultatiAI = risultatiAI.map(res => {
        if (res.soggetto_id && !res.ragione_sociale) {
          const s = soggettiSafe.find(sog => sog.id === res.soggetto_id);
          if (s) res.ragione_sociale = s.ragione_sociale;
        }
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