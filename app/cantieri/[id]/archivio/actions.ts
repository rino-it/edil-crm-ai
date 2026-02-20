'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { salvaDocumentoCantiere, eliminaDocumentoCantiereRecord } from '@/utils/data-fetcher'
import { parseDocumentoCantiere } from '@/utils/ai/gemini'

export async function uploadDocumento(formData: FormData) {
  const cantiereId = formData.get('cantiere_id') as string
  let errorMessage = ''

  try {
    const supabase = await createClient()
    const file = formData.get('file') as File
    const categoriaUtente = formData.get('categoria') as string

    if (!file || file.size === 0) {
      throw new Error("Nessun file caricato")
    }

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

    if (uploadError) throw new Error(`Errore Storage: ${uploadError.message}`)

    const { data: { publicUrl } } = supabase
      .storage
      .from('documenti_cantiere')
      .getPublicUrl(filePath)

    let datiAI = null
    try {
      datiAI = await parseDocumentoCantiere({
        base64: base64Data,
        mimeType: mimeType
      })
    } catch (aiError) {
      console.error("AI Fallita, procedo senza dati:", aiError)
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
      throw new Error(`Errore Database: ${result.error}`)
    }

  } catch (error: any) {
    console.error("Errore upload:", error)
    errorMessage = error.message
  }

  // Il redirect deve stare FUORI dal try/catch in Next.js
  if (errorMessage) {
    redirect(`/cantieri/${cantiereId}/archivio?error=${encodeURIComponent(errorMessage)}`)
  } else {
    revalidatePath(`/cantieri/${cantiereId}/archivio`)
    redirect(`/cantieri/${cantiereId}/archivio`)
  }
}

export async function deleteDocumento(documentoId: string, urlStorage: string, cantiereId: string) {
  let errorMessage = ''
  try {
    const supabase = await createClient()
    const dbResult = await eliminaDocumentoCantiereRecord(documentoId)
    if (!dbResult.success) throw new Error(dbResult.error)

    const urlParts = urlStorage.split('documenti_cantiere/')
    if (urlParts.length === 2) {
      const filePath = urlParts[1]
      await supabase.storage.from('documenti_cantiere').remove([filePath])
    }
  } catch (error: any) {
    errorMessage = error.message
  }

  if (errorMessage) {
    redirect(`/cantieri/${cantiereId}/archivio?error=${encodeURIComponent(errorMessage)}`)
  } else {
    revalidatePath(`/cantieri/${cantiereId}/archivio`)
    redirect(`/cantieri/${cantiereId}/archivio`)
  }
}