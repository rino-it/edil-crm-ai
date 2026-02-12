'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function creaCantiere(formData: FormData) {
  const supabase = await createClient()

  const codice = formData.get('codice') as string
  const descrizione = formData.get('descrizione') as string
  const indirizzo = formData.get('indirizzo') as string
  const budgetStr = formData.get('budget') as string
  const budget = budgetStr ? parseFloat(budgetStr) : 0

  console.log("Tentativo inserimento cantiere:", { codice, descrizione, indirizzo, budget });

  const { data, error } = await supabase
    .from('cantieri')
    .insert([
      {
        codice: codice,
        descrizione: descrizione,
        indirizzo: indirizzo,
        budget: budget,
        stato: 'aperto'
      }
    ])
    .select()

  if (error) {
    // Questo log apparirà nei "Runtime Logs" di Vercel
    console.error("Errore Supabase dettagliato:", error.message, error.details, error.hint)
    redirect(`/cantieri/nuovo?error=${encodeURIComponent(error.message)}`)
  }

  console.log("Cantiere creato con successo:", data);
  revalidatePath('/cantieri')
  redirect('/cantieri')
}