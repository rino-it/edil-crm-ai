'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvaDocumentoCantiere, eliminaDocumentoCantiereRecord } from '@/utils/data-fetcher'
import { parseDocumentoCantiere } from '@/utils/ai/gemini'

export async function uploadDocumento(formData: FormData) {
  const supabase = await createClient()

  const file = formData.get('file') as File
  const cantiereId = formData.get('cantiere_id') as string
  const categoriaUtente = formData.get('categoria') as string // Se l'utente l'ha forzata

  if (!file || file.size === 0) {
    throw new Error("Nessun file caricato")
  }

  try {
    // 1. Lettura File come Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type || 'application/octet-stream'
    
    // Per Gemini, convertiamo in base64
    const base64Data = buffer.toString('base64')

    // 2. Upload su Supabase Storage
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

    // Costruiamo URL Pubblico (o autenticato)
    const { data: { publicUrl } } = supabase
      .storage
      .from('documenti_cantiere')
      .getPublicUrl(filePath)

    // 3. Analisi AI (Smart Expiry)
    let datiAI = null
    try {
      console.log("Invio documento all'AI per analisi...")
      datiAI = await parseDocumentoCantiere({
        base64: base64Data,
        mimeType: mimeType
      })
      console.log("Analisi AI completata:", datiAI)
    } catch (aiError) {
      console.error("L'AI non è riuscita ad analizzare il documento:", aiError)
      // Non blocchiamo l'upload se l'AI fallisce
    }

    // 4. Scelta Categoria (Utente vince su AI)
    let categoriaFinale = 'Altro'
    if (categoriaUtente && categoriaUtente !== '') {
      categoriaFinale = categoriaUtente
    } else if (datiAI?.categoria_suggerita) {
      // Validiamo che la categoria AI sia tra quelle ammesse
      const ammesse = ['Sicurezza_POS_PSC', 'Manutenzione_Mezzi', 'Personale', 'DDT_Fatture', 'Foto', 'Altro']
      if (ammesse.includes(datiAI.categoria_suggerita)) {
        categoriaFinale = datiAI.categoria_suggerita
      }
    }

    // 5. Salvataggio su Database
    const result = await salvaDocumentoCantiere({
      cantiere_id: cantiereId,
      nome_file: file.name,
      url_storage: publicUrl,
      categoria: categoriaFinale,
      data_scadenza: datiAI?.data_scadenza || null,
      note: datiAI?.note_estratte || null,
      ai_dati_estratti: datiAI || null
    })

    if (!result.success) {
      // Rollback: se il DB fallisce, eliminiamo il file dallo storage
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
    // 1. Elimina dal DB
    const dbResult = await eliminaDocumentoCantiereRecord(documentoId)
    if (!dbResult.success) throw new Error(dbResult.error)

    // 2. Estrai il path relativo per lo storage dall'URL
    // Es URL: https://.../storage/v1/object/public/documenti_cantiere/123/nome.pdf
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