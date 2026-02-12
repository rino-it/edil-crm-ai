'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function aggiungiMovimento(formData: FormData) {
  const supabase = await createClient()

  const cantiereId = formData.get('cantiere_id') as string
  const descrizione = formData.get('descrizione') as string
  const importo = formData.get('importo') as string
  const dataMovimento = formData.get('data') as string
  const tipo = formData.get('tipo') as string

  const { error } = await supabase.from('movimenti').insert({
    cantiere_id: cantiereId,
    descrizione,
    importo: parseFloat(importo),
    data_movimento: dataMovimento,
    tipo,
  })

  if (error) {
    console.error(error)
    return redirect(`/cantieri/${cantiereId}/spesa?error=true`)
  }

  revalidatePath(`/cantieri/${cantiereId}`)
  redirect(`/cantieri/${cantiereId}`)
}