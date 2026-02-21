'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * 1. Crea una nuova scadenza manuale (Entrata o Uscita)
 */
export async function creaScadenza(formData: FormData) {
  const supabase = await createClient()

  const rawFormData = {
    tipo: formData.get('tipo') as string, // 'entrata' | 'uscita'
    soggetto_id: formData.get('soggetto_id') as string || null,
    cantiere_id: formData.get('cantiere_id') as string || null,
    fattura_riferimento: formData.get('fattura_riferimento') as string || null,
    descrizione: formData.get('descrizione') as string || null,
    importo_totale: parseFloat(formData.get('importo_totale') as string) || 0,
    importo_pagato: 0,
    data_emissione: formData.get('data_emissione') as string || null,
    data_scadenza: formData.get('data_scadenza') as string,
    metodo_pagamento: formData.get('metodo_pagamento') as string || null,
    stato: 'da_pagare'
  }

  const { error } = await supabase
    .from('scadenze_pagamento')
    .insert([rawFormData])

  if (error) {
    console.error("❌ Errore creaScadenza:", error)
    redirect(`/scadenze?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scadenze')
  revalidatePath('/finanza')
  redirect('/scadenze')
}

/**
 * 2. Registra un pagamento su una scadenza esistente
 * Gestisce automaticamente il passaggio a 'parziale' o 'pagato'
 */
export async function segnaComePagato(formData: FormData) {
  const supabase = await createClient()
  
  const id = formData.get('scadenza_id') as string
  const importoPagamento = parseFloat(formData.get('importo_pagamento') as string) || 0
  const dataPagamento = formData.get('data_pagamento') as string || new Date().toISOString().split('T')[0]
  const metodoPagamento = formData.get('metodo_pagamento') as string || null

  // Recuperiamo i dati attuali della scadenza
  const { data: scadenza, error: fetchError } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato')
    .eq('id', id)
    .single()

  if (fetchError || !scadenza) {
    console.error("❌ Errore recupero scadenza:", fetchError)
    redirect(`/scadenze?error=Scadenza non trovata`)
  }

  const nuovoImportoPagato = (scadenza.importo_pagato || 0) + importoPagamento
  
  // Logica Stato
  let nuovoStato = 'parziale'
  if (nuovoImportoPagato >= scadenza.importo_totale) {
    nuovoStato = 'pagato'
  }

  const { error: updateError } = await supabase
    .from('scadenze_pagamento')
    .update({
      importo_pagato: nuovoImportoPagato,
      stato: nuovoStato,
      data_pagamento: nuovoStato === 'pagato' ? dataPagamento : null,
      metodo_pagamento: metodoPagamento
    })
    .eq('id', id)

  if (updateError) {
    console.error("❌ Errore aggiornamento pagamento:", updateError)
    redirect(`/scadenze?error=${encodeURIComponent(updateError.message)}`)
  }

  revalidatePath('/scadenze')
  revalidatePath('/finanza')
  // Nota: Nessun redirect qui, così la modale/form può chiudersi o aggiornarsi
}

/**
 * 3. Aggiorna lo stato delle scadenze superate (chiamata solitamente dal Cron)
 */
export async function aggiornaStatoScadute() {
  const supabase = await createClient()

  // UPDATE scadenze_pagamento SET stato = 'scaduto' 
  // WHERE data_scadenza < OGGI AND stato IN ('da_pagare', 'parziale')
  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ stato: 'scaduto' })
    .lt('data_scadenza', new Date().toISOString().split('T')[0])
    .in('stato', ['da_pagare', 'parziale'])

  if (error) {
    console.error("❌ Errore aggiornamento scadenze scadute:", error)
    return { success: false, error: error.message }
  }

  revalidatePath('/scadenze')
  return { success: true }
}

export async function assegnaCantiereAScadenza(scadenzaId: string, cantiereId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("scadenze_pagamento")
    .update({ cantiere_id: cantiereId === "null" ? null : cantiereId })
    .eq("id", scadenzaId);

  if (error) {
    console.error("❌ Errore assegnazione cantiere:", error);
    return { error: error.message };
  }
  
  revalidatePath('/scadenze');
  revalidatePath('/finanza'); // Aggiorna anche la dashboard!
  return { success: true };
}