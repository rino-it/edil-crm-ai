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
  redirect('/scadenze?success=Scadenza+creata+con+successo')
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
  redirect('/scadenze?success=Pagamento+registrato')
}

/**
 * 3. Aggiorna lo stato delle scadenze superate (chiamata solitamente dal Cron)
 */
export async function aggiornaStatoScadute() {
  const supabase = await createClient()

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

/**
 * 4. Assegnazione Cantiere Semplice (Legacy)
 */
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
  revalidatePath('/finanza'); 
  return { success: true };
}

/**
 * 5. Salva l'assegnazione del cantiere (Singolo o Multiplo - NUOVO)
 */
export async function salvaAssegnazioneCantiere(
  scadenzaId: string, 
  data: { mode: 'singolo', cantiere_id: string } | { mode: 'multiplo', allocazioni: { cantiere_id: string, importo: number }[] }
) {
  const supabase = await createClient()

  if (data.mode === 'singolo') {
    const { error: errUpdate } = await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: data.cantiere_id || null })
      .eq('id', scadenzaId)

    if (errUpdate) throw new Error("Errore aggiornamento cantiere")

    const { error: errDelete } = await supabase
      .from('scadenze_cantiere')
      .delete()
      .eq('scadenza_id', scadenzaId)

    if (errDelete) throw new Error("Errore rimozione vecchie allocazioni")

  } else {
    const { error: errUpdate } = await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: null })
      .eq('id', scadenzaId)

    if (errUpdate) throw new Error("Errore reset cantiere")

    const { error: errDelete } = await supabase
      .from('scadenze_cantiere')
      .delete()
      .eq('scadenza_id', scadenzaId)

    if (errDelete) throw new Error("Errore rimozione vecchie allocazioni")

    const righeToInsert = data.allocazioni
      .filter(a => a.cantiere_id && a.importo > 0)
      .map(a => ({
        scadenza_id: scadenzaId,
        cantiere_id: a.cantiere_id,
        importo: a.importo
      }))

    if (righeToInsert.length > 0) {
      const { error: errInsert } = await supabase
        .from('scadenze_cantiere')
        .insert(righeToInsert)

      if (errInsert) throw new Error("Errore inserimento nuove allocazioni: " + errInsert.message)
    }
  }

  revalidatePath('/scadenze')
  revalidatePath('/scadenze/da-smistare')
}

/**
 * 6. Assegna massivamente un cantiere a più scadenze ("Da Smistare")
 */
export async function assegnaCantiereBulk(scadenzaIds: string[], cantiereId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ cantiere_id: cantiereId || null })
    .in('id', scadenzaIds)

  if (error) {
    console.error("Errore assegnaCantiereBulk:", error)
    throw new Error("Impossibile assegnare il cantiere in modo massivo.")
  }

  const { error: errDelete } = await supabase
    .from('scadenze_cantiere')
    .delete()
    .in('scadenza_id', scadenzaIds)

  if (errDelete) {
    console.error("Errore pulizia scadenze_cantiere bulk:", errDelete)
  }

  revalidatePath('/scadenze')
  revalidatePath('/scadenze/da-smistare')
}

/**
 * 7. Invia sollecito WhatsApp (Placeholder per Fase 3)
 */
export async function inviaReminderWhatsApp(scadenzaId: string) {
  console.log("Invia reminder per scadenza", scadenzaId)
}

export async function registraIncassoFattura(scadenzaId: string, contoId: string, dataPagamento: string, metodoPagamento: string) {
  const supabase = await createClient();

  // 1. Recupera i dati della fattura
  const { data: scadenza, error: errScad } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, fattura_riferimento')
    .eq('id', scadenzaId)
    .single();

  if (errScad || !scadenza) throw new Error('Fattura non trovata');

  const daIncassare = Number(scadenza.importo_totale) - Number(scadenza.importo_pagato || 0);

  // 2. Chiudi la fattura
  const { error: errUpdate } = await supabase.from('scadenze_pagamento').update({
    stato: 'pagato',
    importo_pagato: scadenza.importo_totale,
    data_pagamento: dataPagamento,
    metodo_pagamento: metodoPagamento
  }).eq('id', scadenzaId);

  if (errUpdate) throw new Error('Errore aggiornamento fattura');

  // 3. Crea il movimento bancario manuale GIA' RICONCILIATO
  await supabase.from('movimenti_banca').insert({
    conto_banca_id: contoId,
    data_operazione: dataPagamento,
    importo: daIncassare, // Entrata positiva
    descrizione: `Incasso manuale: ${scadenza.fattura_riferimento || 'Fattura Vendita'}`,
    stato_riconciliazione: 'riconciliato',
    scadenza_id: scadenzaId
  });

  // 4. Aumenta il saldo della banca (Il Data Zero viene rispettato)
  const { data: conto } = await supabase.from('conti_banca').select('saldo_attuale').eq('id', contoId).single();
  if (conto) {
    await supabase.from('conti_banca').update({
      saldo_attuale: Number(conto.saldo_attuale) + daIncassare
    }).eq('id', contoId);
  }

  // Aggiorna la vista
  revalidatePath('/scadenze');
  revalidatePath('/finanza');
  
  return { success: true };
}

export async function riprogrammaScadenza(scadenzaId: string, nuovaData: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ data_pianificata: nuovaData })
    .eq('id', scadenzaId);

  if (error) {
    console.error('❌ Errore riprogrammaScadenza:', error);
    throw new Error('Errore durante la riprogrammazione');
  }

  revalidatePath('/scadenze');
  revalidatePath('/finanza');
  revalidatePath('/finanza/programmazione');

  return { success: true };
}