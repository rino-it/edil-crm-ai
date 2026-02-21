import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { matchRiconciliazioneBancaria } from '@/utils/ai/gemini';

export async function POST(request: Request) {
  try {
    const { movimenti } = await request.json();

    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      return NextResponse.json({ error: "Nessun movimento fornito per l'analisi." }, { status: 400 });
    }

    // 1. Recuperiamo il client Supabase con i permessi necessari
    const supabase = await createClient();

    // 2. Scarichiamo TUTTE le scadenze aperte una sola volta per non stressare il database
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

    // 3. Elaborazione in Parallelo (Promise.all) per velocizzare le chiamate a Gemini
    const promesseMatching = movimenti.map(async (movimento) => {
      // Ottimizzazione: Se è un'entrata (>0), cerca solo crediti. Se uscita (<0), cerca solo debiti.
      const tipoRichiesto = movimento.importo > 0 ? 'entrata' : 'uscita';
      const scadenzeFiltrate = scadenzeAperte.filter(s => s.tipo === tipoRichiesto);

      if (scadenzeFiltrate.length === 0) {
         return {
            movimento_id: movimento.id,
            scadenza_id: null,
            confidence: 0,
            motivo: `Nessuna scadenza aperta trovata di tipo: ${tipoRichiesto}.`
         };
      }

      // Passiamo la palla a Gemini (la funzione creata nello Step 5.4)
      const suggerimento = await matchRiconciliazioneBancaria(movimento, scadenzeFiltrate);

      return {
        movimento_id: movimento.id,
        scadenza_id: suggerimento.scadenza_id,
        confidence: suggerimento.confidence || 0,
        motivo: suggerimento.motivo || "Nessuna motivazione fornita."
      };
    });

    const risultati = await Promise.all(promesseMatching);

    // 4. Aggiorniamo il database in modo che i suggerimenti rimangano salvati
    for (const res of risultati) {
      if (res.scadenza_id) {
        // Usiamo un payload generico "ai_suggerimento" (JSONB) o le colonne dedicate se presenti
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

    return NextResponse.json({ risultati });

  } catch (error: any) {
    console.error("❌ Errore API Riconciliazione:", error);
    return NextResponse.json({ error: error.message || "Errore interno del server" }, { status: 500 });
  }
}