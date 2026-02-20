import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { parseComputoFoto } from '@/utils/ai/gemini'

// Definiamo l'interfaccia per la riga per far felice TypeScript
interface ComputoRigaOCR {
  codice: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  prezzo_unitario: number | null;
}

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

    // Specifichiamo il tipo 'r: ComputoRigaOCR' per risolvere l'errore di compilazione
    const dataToInsert = ocrResult.righe.map((r: ComputoRigaOCR) => ({
      cantiere_id: cantiereId,
      codice: r.codice || 'N/D',
      descrizione: r.descrizione || 'Senza descrizione',
      unita_misura: r.unita_misura || 'corpo',
      quantita: r.quantita || 1,
      prezzo_unitario: r.prezzo_unitario || 0,
      stato_validazione: r.prezzo_unitario ? 'confermato' : 'da_validare'
    }))

    // 2. Salvataggio su Supabase
    const { error } = await supabase.from('computo_voci').insert(dataToInsert)
    if (error) throw error

    return NextResponse.json({ success: true, count: dataToInsert.length })
  } catch (error: any) {
    console.error("Errore OCR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}