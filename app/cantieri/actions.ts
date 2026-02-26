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

  // Log di controllo per vedere cosa inviamo
  console.log("Dati inviati:", { codice, descrizione, indirizzo, budget });

  const { error } = await supabase
    .from('cantieri')
    .insert([
      {
        nome: descrizione,      // FIX: Usiamo 'nome' come richiesto dal tuo DB
        codice: codice,
        indirizzo: indirizzo,
        budget: budget,
        stato: 'aperto'
        // 'descrizione' la togliamo se non esiste nella tabella o la lasciamo se vuoi duplicare
      }
    ])

  if (error) {
    console.error("Errore Supabase:", error.message)
    redirect(`/cantieri/nuovo?error=${encodeURIComponent(error.message)}`)
  }

  // Sincronizza i dati
  revalidatePath('/cantieri')
  revalidatePath('/')
  redirect('/?success=Cantiere+creato+con+successo')
}