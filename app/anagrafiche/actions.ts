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