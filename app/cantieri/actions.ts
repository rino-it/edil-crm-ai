'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function creaCantiere(formData: FormData) {
  const supabase = await createClient()

  const codice = formData.get('codice') as string
  const descrizione = formData.get('descrizione') as string
  const indirizzo = formData.get('indirizzo') as string
  const budget = formData.get('budget') as string

  const { error } = await supabase.from('cantieri').insert({
    codice,
    descrizione,
    indirizzo,
    budget: parseFloat(budget),
    stato: 'aperto'
  })

  if (error) {
    console.error(error)
    // FIX: Usiamo redirect invece di 'return' per soddisfare TypeScript
    redirect('/cantieri/nuovo?error=true')
  }

  revalidatePath('/cantieri')
  redirect('/cantieri')
}