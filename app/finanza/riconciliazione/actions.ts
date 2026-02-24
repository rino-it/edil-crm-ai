'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { parseCSVBanca, parseXMLBanca, importMovimentiBanca, confermaRiconciliazione } from '@/utils/data-fetcher'

export async function importaEstrattoConto(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) throw new Error("Nessun file selezionato.");
    
    const text = await file.text();
    const fileName = file.name.toLowerCase();
    
    let movimenti;
    
    if (fileName.endsWith('.xml')) {
      movimenti = parseXMLBanca(text);
      console.log(`📦 XML: ${movimenti.length} movimenti estratti`);
    } else if (fileName.endsWith('.csv')) {
      movimenti = parseCSVBanca(text);
      console.log(`📦 CSV: ${movimenti.length} movimenti estratti`);
    } else {
      throw new Error("Formato non supportato. Usa file .csv o .xml");
    }
    
    if (movimenti.length === 0) {
      throw new Error("Nessun movimento valido trovato.");
    }
    
    const inseriti = await importMovimentiBanca(movimenti);
    
    revalidatePath('/finanza/riconciliazione');
    return { success: true, conteggio: inseriti?.length || 0 };
  } catch (error: any) {
    console.error("❌ Errore importazione:", error);
    return { error: error.message };
  }
}

export async function handleConferma(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string | null;
    const soggetto_id = formData.get('soggetto_id') as string | null;
    const personale_id = formData.get('personale_id') as string | null;
    const categoria = formData.get('categoria') as string;
    const importo = Number(formData.get('importo'));

    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // ===============================================
    // CASO SPECIALE: Commissione, Giroconto, Stipendio
    // ===============================================
    if (['commissione', 'giroconto', 'stipendio'].includes(categoria)) {
      // Salviamo il movimento come riconciliato assegnandogli la sua categoria. Non tocca le fatture.
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          categoria_dedotta: categoria,
          personale_id: personale_id || null // Se stipendio, lega il dipendente
        })
        .eq('id', movimento_id);
    } 
    // ===============================================
    // CASO A: Match Esatto Fattura
    // ===============================================
    else if (scadenza_id) {
      await confermaRiconciliazione(
        movimento_id, 
        scadenza_id, 
        importo, 
        'confermato_utente',
        soggetto_id || undefined
      );
    } 
    // ===============================================
    // CASO B: Allocazione Multipla / Acconto
    // ===============================================
    else if (soggetto_id) {
      // 1. Segniamo il movimento come riconciliato
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          soggetto_id: soggetto_id,
          categoria_dedotta: categoria || 'fattura'
        })
        .eq('id', movimento_id);

      // 2. Avviamo il Motore di Allocazione Multipla (FIFO + Combinazioni)
      await allocaPagamentoIntelligente(supabaseAdmin, soggetto_id, importo);
      
    } else {
      throw new Error("Dati insufficienti per confermare (manca scadenza, soggetto o categoria valida).");
    }

    // Aggiorna tutte le viste finanziarie + Anagrafiche
    revalidatePath('/finanza/riconciliazione');
    revalidatePath('/finanza');
    revalidatePath('/scadenze');
    revalidatePath('/anagrafiche'); 
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore conferma match:", error);
    return { error: error.message };
  }
}

export async function handleRifiuta(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    // AZZERIAMO TUTTO: in questo modo il frontend mostra il menu a tendina manuale
    const { error } = await supabaseAdmin
      .from('movimenti_banca')
      .update({ 
        ai_suggerimento: null, 
        soggetto_id: null, 
        personale_id: null,
        categoria_dedotta: null, // FONDAMENTALE
        ai_confidence: 0, 
        ai_motivo: 'Selezione manuale richiesta' 
      })
      .eq('id', movimento_id);

    if (error) throw error;

    revalidatePath('/finanza/riconciliazione');
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore rifiuto match:", error);
    return { error: error.message };
  }
}

// Manteniamo il collegamento della vecchia funzione se la usi altrove
export async function matchManuale(formData: FormData) {
  return handleConferma(formData);
}

// ============================================================================
// MOTORE DI ALLOCAZIONE INTELLIGENTE (Subset Sum Sicuro + FIFO)
// ============================================================================

async function allocaPagamentoIntelligente(supabaseAdmin: any, soggetto_id: string, importo_pagato: number) {
  // 1. Recupera tutte le scadenze aperte
  const { data: scadenzeAperte } = await supabaseAdmin
    .from('scadenze_pagamento')
    .select('id, importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id)
    .neq('stato', 'pagato')
    .order('data_scadenza', { ascending: true });

  if (!scadenzeAperte || scadenzeAperte.length === 0) return;

  const targetCents = Math.round(importo_pagato * 100);
  const items = scadenzeAperte.map((s: any) => ({
    ...s,
    residuoCents: Math.round((Number(s.importo_totale) - Number(s.importo_pagato || 0)) * 100)
  }));

  let combinazioneEsatta = null;

  // 2. FASE 1: Combinazione Esatta (Limite di sicurezza: 20 fatture)
  if (items.length <= 20) {
    function trovaCombinazioneEsatta(index: number, sum: number, subset: any[]): any[] | null {
      if (sum === targetCents) return subset;
      if (sum > targetCents || index >= items.length) return null;
      
      const include = trovaCombinazioneEsatta(index + 1, sum + items[index].residuoCents, [...subset, items[index]]);
      if (include) return include;
      
      return trovaCombinazioneEsatta(index + 1, sum, subset);
    }
    combinazioneEsatta = trovaCombinazioneEsatta(0, 0, []);
  } else {
    console.log(`⚠️ Troppe fatture (${items.length}), fallback su FIFO per evitare Timeout.`);
  }

  // Se trova l'esatta combinazione, chiude quelle
  if (combinazioneEsatta) {
    for (const scadenza of combinazioneEsatta) {
      await supabaseAdmin
        .from('scadenze_pagamento')
        .update({ importo_pagato: scadenza.importo_totale, stato: 'pagato' })
        .eq('id', scadenza.id);
    }
    return;
  }

  // 3. FASE 2: Logica FIFO
  let budgetResiduoCents = targetCents;

  for (const scadenza of items) {
    if (budgetResiduoCents <= 0) break;

    const daPagareCents = Math.min(scadenza.residuoCents, budgetResiduoCents);
    budgetResiduoCents -= daPagareCents;

    const vecchioPagatoEuro = Number(scadenza.importo_pagato || 0);
    const nuovoPagatoEuro = vecchioPagatoEuro + (daPagareCents / 100);
    
    // Tolleranza di 1 centesimo
    const nuovoStato = (nuovoPagatoEuro >= Number(scadenza.importo_totale) - 0.01) ? 'pagato' : 'parziale';

    await supabaseAdmin
      .from('scadenze_pagamento')
      .update({ importo_pagato: nuovoPagatoEuro, stato: nuovoStato })
      .eq('id', scadenza.id);
  }
}