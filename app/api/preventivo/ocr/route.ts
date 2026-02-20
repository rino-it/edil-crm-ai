import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { parseComputoFoto } from '@/utils/ai/gemini'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const cantiereId = formData.get('cantiere_id') as string

    if (!file) return NextResponse.json({ error: "File mancante" }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // 1. Analisi OCR con Gemini
    const ocrResult = await parseComputoFoto({
      base64,
      mimeType: file.type
    })

    const supabase = await createClient()
    const dataToInsert = ocrResult.righe.map(r => ({
      cantiere_id: cantiereId,
      codice: r.codice,
      descrizione: r.descrizione,
      unita_misura: r.unita_misura,
      quantita: r.quantita,
      prezzo_unitario: r.prezzo_unitario || 0,
      stato_validazione: r.prezzo_unitario ? 'confermato' : 'da_validare'
    }))

    // 2. Salvataggio
    const { error } = await supabase.from('computo_voci').insert(dataToInsert)
    if (error) throw error

    return NextResponse.json({ success: true, count: dataToInsert.length })
  } catch (error: any) {
    console.error("Errore OCR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}