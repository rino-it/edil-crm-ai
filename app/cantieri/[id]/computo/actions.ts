'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function uploadComputo(formData: FormData) {
  const supabase = await createClient()

  const file = formData.get('file') as File
  const cantiereId = formData.get('cantiere_id') as string

  if (!file) {
    throw new Error("Nessun file caricato")
  }

  // 1. Leggi il contenuto del file
  const text = await file.text()
  
  // 2. Parsing manuale del CSV (Gestisce ; e , come separatori)
  const rows = text.split('\n').filter(row => row.trim() !== '')
  const dataToInsert = []

  // Saltiamo la prima riga (header)
  for (let i = 1; i < rows.length; i++) {
    // Rimuove ritorni a capo e splitta per punto e virgola (Excel standard IT) o virgola
    const cols = rows[i].replace(/\r/g, '').split(/[;,]/)
    
    // Assumiamo ordine: Codice, Descrizione, UM, Quantità, Prezzo
    if (cols.length >= 5) {
      dataToInsert.push({
        cantiere_id: cantiereId,
        codice: cols[0].trim(),
        descrizione: cols[1].trim(),
        unita_misura: cols[2].trim(),
        quantita: parseFloat(cols[3].replace(',', '.')) || 0,
        prezzo_unitario: parseFloat(cols[4].replace(',', '.')) || 0
      })
    }
  }

  if (dataToInsert.length === 0) {
    return redirect(`/cantieri/${cantiereId}/computo?error=Nessuna riga valida trovata`)
  }

  // 3. Inserimento massivo nel DB
  const { error } = await supabase
    .from('computo_voci')
    .insert(dataToInsert)

  if (error) {
    console.error("Errore importazione:", error)
    return redirect(`/cantieri/${cantiereId}/computo?error=Errore Database`)
  }

  // 4. Ricalcola il budget totale del cantiere (Opzionale ma utile)
  const totaleBudget = dataToInsert.reduce((acc, row) => acc + (row.quantita * row.prezzo_unitario), 0)
  
  await supabase
    .from('cantieri')
    .update({ budget: totaleBudget })
    .eq('id', cantiereId)

  revalidatePath(`/cantieri/${cantiereId}`)
  redirect(`/cantieri/${cantiereId}/computo`)
}