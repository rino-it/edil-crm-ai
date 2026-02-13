import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// 1. VERIFICA DEL WEBHOOK (Meta chiama qui per validare il token)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Estraiamo i parametri che ci manda Meta
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    const VERIFY_TOKEN = 'edil-crm-segreto-2024'

    // --- LOG DI DEBUG (QUINTESSENZIALE) ---
    console.log("🔍 [WEBHOOK GET] Tentativo di verifica ricevuto!")
    console.log(`➡️ Mode ricevuto: '${mode}'`)
    console.log(`➡️ Token ricevuto: '${token}'`) // Le virgolette ' ' ci mostrano se ci sono spazi!
    console.log(`🔐 Token atteso:   '${VERIFY_TOKEN}'`)
    console.log(`❓ Challenge:      '${challenge}'`)
    // ---------------------------------------

    // Verifica stretta
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("✅ [WEBHOOK GET] Verifica RIUSCITA. Rispondo con challenge.")
      return new NextResponse(challenge, { status: 200 })
    } else {
      console.log("❌ [WEBHOOK GET] Verifica FALLITA. I token non corrispondono.")
      return new NextResponse('Token non valido o errato', { status: 403 })
    }
  } catch (error) {
    console.error("🔥 [WEBHOOK GET] Errore interno:", error)
    return new NextResponse('Errore server', { status: 500 })
  }
}

// 2. RICEZIONE MESSAGGI (Meta invia qui i messaggi)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    console.log("📩 [WEBHOOK POST] Messaggio ricevuto da Meta")

    // Controllo se è un messaggio WhatsApp
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value
      const message = value?.messages?.[0]

      if (message) {
        const sender = message.from 
        const type = message.type
        
        // Estrazione contenuto
        let rawContent = ''
        let mediaId = null

        if (type === 'text') {
            rawContent = message.text?.body || ''
        } else if (type === 'image') {
            rawContent = message.image?.caption || '[FOTO]'
            mediaId = message.image?.id
        } else if (type === 'document') {
            rawContent = message.document?.caption || message.document?.filename || '[DOCUMENTO]'
            mediaId = message.document?.id
        }

        console.log(`👤 Mittente: ${sender} | Tipo: ${type} | Contenuto: ${rawContent}`)

        // Salvataggio su Supabase
        const { error } = await supabase.from('chat_log').insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId, 
            status_ai: 'pending',
            ai_response: body
        })

        if (error) {
            console.error('❌ Errore salvataggio DB:', error)
        } else {
            console.log('💾 Messaggio salvato correttamente nel DB')
        }
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 [WEBHOOK POST] Errore critico:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}