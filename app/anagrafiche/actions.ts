'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function addSoggetto(formData: FormData) {
  const supabase = await createClient()

  const rawFormData = {
    tipo: formData.get('tipo') as string,
    ragione_sociale: formData.get('ragione_sociale') as string,
    partita_iva: formData.get('partita_iva') as string || null,
    codice_fiscale: formData.get('codice_fiscale') as string || null,
    indirizzo: formData.get('indirizzo') as string || null,
    email: formData.get('email') as string || null,
    telefono: formData.get('telefono') as string || null,
    pec: formData.get('pec') as string || null,
    codice_sdi: (formData.get('codice_sdi') as string) || '0000000',
    iban: formData.get('iban') as string || null,
    condizioni_pagamento: (formData.get('condizioni_pagamento') as string) || '30gg DFFM',
    note: formData.get('note') as string || null,
  }

  const { error } = await supabase
    .from('anagrafica_soggetti')
    .insert([rawFormData])

  if (error) {
    console.error("❌ Errore addSoggetto:", error)
    redirect(`/anagrafiche?error=${encodeURIComponent(error.message)}`)
  }

  // Ricarica i dati
  revalidatePath('/anagrafiche')
  redirect('/anagrafiche?success=Anagrafica+creata+con+successo')
}

export async function editSoggetto(formData: FormData) {
  const supabase = await createClient()
  const id = formData.get('id') as string

  const rawFormData = {
    tipo: formData.get('tipo') as string,
    ragione_sociale: formData.get('ragione_sociale') as string,
    partita_iva: formData.get('partita_iva') as string || null,
    codice_fiscale: formData.get('codice_fiscale') as string || null,
    indirizzo: formData.get('indirizzo') as string || null,
    email: formData.get('email') as string || null,
    telefono: formData.get('telefono') as string || null,
    pec: formData.get('pec') as string || null,
    codice_sdi: formData.get('codice_sdi') as string || '0000000',
    iban: formData.get('iban') as string || null,
    condizioni_pagamento: formData.get('condizioni_pagamento') as string || '30gg DFFM',
    note: formData.get('note') as string || null,
  }

  const { error } = await supabase
    .from('anagrafica_soggetti')
    .update(rawFormData)
    .eq('id', id)

  if (error) {
    console.error("❌ Errore editSoggetto:", error)
    redirect(`/anagrafiche/${id}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/anagrafiche')
  revalidatePath(`/anagrafiche/${id}`)
  redirect(`/anagrafiche/${id}?success=Modifiche+salvate`)
}

export async function deleteSoggetto(formData: FormData) {
  const supabase = await createClient()
  const id = formData.get('id') as string

  const { error } = await supabase
    .from('anagrafica_soggetti')
    .delete()
    .eq('id', id)

  if (error) {
    console.error("❌ Errore deleteSoggetto:", error)
    redirect(`/anagrafiche?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/anagrafiche')
  redirect('/anagrafiche?success=Anagrafica+eliminata')
}

export async function mergeSoggetti(
  masterId: string,
  duplicateId: string
): Promise<{ success: boolean; error?: string; merged?: Record<string, number> }> {
  if (masterId === duplicateId) return { success: false, error: 'Master e duplicato sono lo stesso soggetto' }

  const supabase = await createClient()

  // Verifica che entrambi esistano
  const { data: master } = await supabase.from('anagrafica_soggetti').select('id, ragione_sociale').eq('id', masterId).single()
  const { data: duplicate } = await supabase.from('anagrafica_soggetti').select('id, ragione_sociale').eq('id', duplicateId).single()
  if (!master || !duplicate) return { success: false, error: 'Soggetto non trovato' }

  const merged: Record<string, number> = {}

  // Sposta tutti i riferimenti FK dal duplicato al master
  const tabelleFk: { table: string; column: string }[] = [
    { table: 'scadenze_pagamento', column: 'soggetto_id' },
    { table: 'fatture_fornitori', column: 'soggetto_id' },
    { table: 'titoli', column: 'soggetto_id' },
    { table: 'mutui', column: 'soggetto_id' },
    { table: 'movimenti_banca', column: 'soggetto_id' },
  ]

  for (const { table, column } of tabelleFk) {
    const { data: rows } = await supabase
      .from(table)
      .select('id')
      .eq(column, duplicateId)

    const count = rows?.length || 0
    if (count > 0) {
      const { error } = await supabase
        .from(table)
        .update({ [column]: masterId })
        .eq(column, duplicateId)
      if (error) return { success: false, error: `Errore migrazione ${table}: ${error.message}` }
    }
    merged[table] = count
  }

  // Completa dati master con quelli del duplicato (se mancanti)
  const { data: masterFull } = await supabase.from('anagrafica_soggetti').select('*').eq('id', masterId).single()
  const { data: dupFull } = await supabase.from('anagrafica_soggetti').select('*').eq('id', duplicateId).single()
  if (masterFull && dupFull) {
    const campiDaCompletare = ['partita_iva', 'codice_fiscale', 'indirizzo', 'email', 'telefono', 'pec', 'iban'] as const
    const updates: Record<string, string> = {}
    for (const campo of campiDaCompletare) {
      if (!masterFull[campo] && dupFull[campo]) {
        updates[campo] = dupFull[campo]
      }
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('anagrafica_soggetti').update(updates).eq('id', masterId)
    }
  }

  // Elimina il duplicato
  const { error: delErr } = await supabase.from('anagrafica_soggetti').delete().eq('id', duplicateId)
  if (delErr) return { success: false, error: `Errore eliminazione duplicato: ${delErr.message}` }

  console.log(`Merge soggetti: "${duplicate.ragione_sociale}" -> "${master.ragione_sociale}"`, merged)

  revalidatePath('/anagrafiche')
  revalidatePath('/finanza')
  revalidatePath('/scadenze')
  return { success: true, merged }
}