import { createClient } from '@/utils/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

// FORZIAMO LA DINAMICITÀ (Fondamentale su Vercel)
export const dynamic = 'force-dynamic' 

// 1. GESTIONE VERIFICA (GET)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    // CASO 1: Visita dal Browser (Tu che controlli se funziona)
    if (!mode || !token) {
      console.log("👀 Visita manuale rilevata (Browser)")
      return new NextResponse('Webhook Attivo e Pronto! 🚀 (Invia un messaggio su WhatsApp per testare)', { status: 200 })
    }

    // CASO 2: Verifica ufficiale di Meta
    const VERIFY_TOKEN = 'edil-crm-segreto-2024'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("✅ Verifica Meta RIUSCITA.")
      return new NextResponse(challenge, { status: 200 })
    } else {
      console.log("❌ Tentativo di accesso negato (Token errato).")
      return new NextResponse('Token non valido', { status: 403 })
    }
  } catch (error) {
    console.error("🔥 Errore GET:", error)
    return new NextResponse('Errore server', { status: 500 })
  }
}

// 2. RICEZIONE MESSAGGI (POST)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    console.log("📩 [POST] Nuova notifica da WhatsApp!")
    
    // Controllo struttura messaggio
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value
      const message = value?.messages?.[0]

      if (message) {
        const sender = message.from 
        const type = message.type
        
        let rawContent = ''
        let mediaId = null

        // Estrazione intelligente del contenuto in base al tipo
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

        // Salviamo nel database
        const { error } = await supabase.from('chat_log').insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId, 
            status_ai: 'pending',
            ai_response: body
        })

        if (error) console.error("❌ Errore DB:", error)
        else console.log("💾 Messaggio salvato correttamente!")
      } else {
        console.log("⚠️ Webhook ricevuto ma nessun messaggio trovato (forse è una notifica di stato 'letto'/'consegnato')")
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}