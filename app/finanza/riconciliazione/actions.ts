'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { parseCSVBanca, importMovimentiBanca, confermaRiconciliazione } from '@/utils/data-fetcher'

export async function importaCSVBanca(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) throw new Error("Nessun file CSV selezionato.");

    const text = await file.text();
    const movimenti = parseCSVBanca(text);

    if (movimenti.length === 0) {
      throw new Error("Nessun movimento valido trovato. Verifica il formato del CSV.");
    }

    const inseriti = await importMovimentiBanca(movimenti);

    revalidatePath('/finanza/riconciliazione');
    return { success: true, conteggio: inseriti?.length || 0 };
  } catch (error: any) {
    console.error("❌ Errore importazione CSV:", error);
    return { error: error.message };
  }
}

export async function confermaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string;
    const soggetto_id = formData.get('soggetto_id') as string | null;
    const importo = Number(formData.get('importo'));

    if (!movimento_id) throw new Error("ID movimento mancante.");

    // CASO A: Match Esatto 1 a 1 (L'AI o l'utente ha scelto una fattura specifica)
    if (scadenza_id) {
      await confermaRiconciliazione(
        movimento_id, 
        scadenza_id, 
        importo, 
        'confermato_utente',
        soggetto_id || undefined
      );
    } 
    // CASO B: Allocazione Multipla / Acconto (Abbiamo il soggetto, ma non la fattura)
    else if (soggetto_id) {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // 1. Segniamo il movimento come riconciliato
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ stato: 'riconciliato', soggetto_id: soggetto_id })
        .eq('id', movimento_id);

      // 2. Avviamo il Motore di Allocazione Multipla (FIFO + Combinazioni)
      await allocaPagamentoIntelligente(supabaseAdmin, soggetto_id, importo);
      
    } else {
      throw new Error("Dati insufficienti per confermare (manca sia scadenza che soggetto).");
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

export async function rifiutaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    const { error } = await supabaseAdmin
      .from('movimenti_banca')
      .update({ ai_suggerimento: null, soggetto_id: null, ai_confidence: null, ai_motivo: null })
      .eq('id', movimento_id);

    if (error) throw error;

    revalidatePath('/finanza/riconciliazione');
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore rifiuto match:", error);
    return { error: error.message };
  }
}

export async function matchManuale(formData: FormData) {
  return confermaMatch(formData);
}

// ============================================================================
// MOTORE DI ALLOCAZIONE INTELLIGENTE (Subset Sum + FIFO)
// ============================================================================

async function allocaPagamentoIntelligente(supabaseAdmin: any, soggetto_id: string, importo_pagato: number) {
  // 1. Recupera tutte le scadenze aperte del soggetto (dal più vecchio al più nuovo)
  const { data: scadenzeAperte } = await supabaseAdmin
    .from('scadenze_pagamento')
    .select('id, importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id)
    .neq('stato', 'pagato')
    .order('data_scadenza', { ascending: true });

  if (!scadenzeAperte || scadenzeAperte.length === 0) return; // Niente da saldare, resta come acconto libero

  // Arrotonda in centesimi per evitare errori di virgola mobile in Javascript
  const targetCents = Math.round(importo_pagato * 100);
  const items = scadenzeAperte.map((s: any) => ({
    ...s,
    residuoCents: Math.round((Number(s.importo_totale) - Number(s.importo_pagato || 0)) * 100)
  }));

  // 2. FASE 1: Ricerca di una combinazione esatta (Subset Sum)
  function trovaCombinazioneEsatta(index: number, sum: number, subset: any[]): any[] | null {
    if (sum === targetCents) return subset;
    if (sum > targetCents || index >= items.length) return null;
    
    // Includi l'elemento corrente
    const include = trovaCombinazioneEsatta(index + 1, sum + items[index].residuoCents, [...subset, items[index]]);
    if (include) return include;
    
    // Escludi l'elemento corrente
    return trovaCombinazioneEsatta(index + 1, sum, subset);
  }

  const combinazioneEsatta = trovaCombinazioneEsatta(0, 0, []);

  if (combinazioneEsatta) {
    // Trovata somma esatta! Chiudiamo queste specifiche fatture.
    console.log(`🎯 Trovata combinazione esatta per ${importo_pagato}€. Chiudo ${combinazioneEsatta.length} fatture.`);
    for (const scadenza of combinazioneEsatta) {
      await supabaseAdmin
        .from('scadenze_pagamento')
        .update({ importo_pagato: scadenza.importo_totale, stato: 'pagato' })
        .eq('id', scadenza.id);
    }
    return;
  }

  // 3. FASE 2: Logica FIFO (First In, First Out)
  // Nessuna combinazione esatta. Spalmiamo i soldi dalle fatture più vecchie a scendere.
  console.log(`💧 Nessuna somma esatta. Spalmo ${importo_pagato}€ col metodo FIFO.`);
  let budgetResiduoCents = targetCents;

  for (const scadenza of items) {
    if (budgetResiduoCents <= 0) break;

    const daPagareCents = Math.min(scadenza.residuoCents, budgetResiduoCents);
    budgetResiduoCents -= daPagareCents;

    // Calcola i nuovi valori in Euro
    const vecchioPagatoEuro = Number(scadenza.importo_pagato || 0);
    const quotaAggiuntaEuro = daPagareCents / 100;
    const nuovoPagatoEuro = vecchioPagatoEuro + quotaAggiuntaEuro;
    
    // Tolleranza di 1 centesimo per il cambio stato
    const nuovoStato = (nuovoPagatoEuro >= Number(scadenza.importo_totale) - 0.01) ? 'pagato' : 'parziale';

    await supabaseAdmin
      .from('scadenze_pagamento')
      .update({ importo_pagato: nuovoPagatoEuro, stato: nuovoStato })
      .eq('id', scadenza.id);
  }
}