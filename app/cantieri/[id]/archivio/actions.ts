'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvaDocumentoCantiere, eliminaDocumentoCantiereRecord } from '@/utils/data-fetcher'
import { parseDocumentoCantiere } from '@/utils/ai/gemini'

export async function uploadDocumento(formData: FormData) {
  const supabase = await createClient()

  const file = formData.get('file') as File
  const cantiereId = formData.get('cantiere_id') as string
  const categoriaUtente = formData.get('categoria') as string

  if (!file || file.size === 0) {
    throw new Error("Nessun file caricato")
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type || 'application/octet-stream'
    
    const base64Data = buffer.toString('base64')

    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
    const filePath = `${cantiereId}/${fileName}`

    const { error: uploadError } = await supabase
      .storage
      .from('documenti_cantiere')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true
      })

    if (uploadError) {
      console.error("Errore Storage:", uploadError)
      throw new Error(`Errore caricamento file: ${uploadError.message}`)
    }

    const { data: { publicUrl } } = supabase
      .storage
      .from('documenti_cantiere')
      .getPublicUrl(filePath)

    let datiAI = null
    try {
      console.log("Invio documento all'AI per analisi...")
      datiAI = await parseDocumentoCantiere({
        base64: base64Data,
        mimeType: mimeType
      })
    } catch (aiError) {
      console.error("L'AI non è riuscita ad analizzare il documento:", aiError)
    }

    let categoriaFinale = 'Altro'
    if (categoriaUtente && categoriaUtente !== '') {
      categoriaFinale = categoriaUtente
    } else if (datiAI?.categoria_suggerita) {
      const ammesse = ['Sicurezza_POS_PSC', 'Manutenzione_Mezzi', 'Personale', 'DDT_Fatture', 'Foto', 'Altro']
      if (ammesse.includes(datiAI.categoria_suggerita)) {
        categoriaFinale = datiAI.categoria_suggerita
      }
    }

    const result = await salvaDocumentoCantiere({
      cantiere_id: cantiereId,
      nome_file: file.name,
      url_storage: publicUrl,
      categoria: categoriaFinale,
      data_scadenza: datiAI?.data_scadenza || null,
      note: datiAI?.note_estratte || null,
      ai_dati_estratti: datiAI ? (datiAI as unknown as Record<string, unknown>) : null
    })

    if (!result.success) {
      await supabase.storage.from('documenti_cantiere').remove([filePath])
      throw new Error(`Errore salvataggio DB: ${result.error}`)
    }

    revalidatePath(`/cantieri/${cantiereId}/archivio`)
    return { success: true }

  } catch (error: any) {
    console.error("🔥 Errore Server Action uploadDocumento:", error)
    throw new Error(error.message)
  }
}

export async function deleteDocumento(documentoId: string, urlStorage: string, cantiereId: string) {
  const supabase = await createClient()
  
  try {
    const dbResult = await eliminaDocumentoCantiereRecord(documentoId)
    if (!dbResult.success) throw new Error(dbResult.error)

    const urlParts = urlStorage.split('documenti_cantiere/')
    if (urlParts.length === 2) {
      const filePath = urlParts[1]
      await supabase.storage.from('documenti_cantiere').remove([filePath])
    }

    revalidatePath(`/cantieri/${cantiereId}/archivio`)
    return { success: true }
  } catch (error: any) {
    console.error("Errore cancellazione:", error)
    return { success: false, error: error.message }
  }
}