'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function aggiornaDataPianificata(scadenzaId: string, nuovaData: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ data_pianificata: nuovaData })
    .eq('id', scadenzaId)

  if (error) {
    console.error("Errore aggiornamento data pianificata:", error)
    throw new Error("Impossibile aggiornare la data")
  }

  // Questo comando dice a Next.js di ricalcolare immediatamente il grafico e le tabelle
  revalidatePath('/finanza/programmazione')
  revalidatePath('/finanza')
  
  return { success: true }
}

export async function assegnaContoAScadenza(scadenzaId: string, contoBancaId: string | null) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ conto_banca_id: contoBancaId })
    .eq('id', scadenzaId)

  if (error) {
    console.error("Errore assegnazione conto:", error)
    throw new Error("Impossibile assegnare il conto alla scadenza")
  }

  revalidatePath('/finanza/programmazione')
  revalidatePath('/finanza')

  return { success: true }
}
