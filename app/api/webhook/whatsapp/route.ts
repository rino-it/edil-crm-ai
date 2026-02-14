import { createClient } from '@supabase/supabase-js' // Usa la libreria diretta, non quella server
import { NextResponse, NextRequest } from 'next/server'

// FORZIAMO LA DINAMICITÀ
export const dynamic = 'force-dynamic' 

// 1. GESTIONE VERIFICA (GET) - Resta uguale
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (!mode || !token) {
      return new NextResponse('Webhook Attivo! Configura il Service Role per scrivere nel DB.', { status: 200 })
    }

    const VERIFY_TOKEN = 'edil-crm-segreto-2024'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("✅ Verifica Meta RIUSCITA.")
      return new NextResponse(challenge, { status: 200 })
    } else {
      return new NextResponse('Token non valido', { status: 403 })
    }
  } catch (error) {
    console.error("🔥 Errore GET:", error)
    return new NextResponse('Errore server', { status: 500 })
  }
}

// 2. RICEZIONE MESSAGGI (POST) - Modificata per usare ADMIN
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // --- CREAZIONE CLIENT AMMINISTRATORE ---
    // Usiamo la Service Role Key per scavalcare la RLS (Row Level Security)
    // Meta non è un utente loggato, quindi serve i superpoteri.
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Assicurati di averla messa su Vercel!
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log("📩 [POST] Nuova notifica da WhatsApp!")
    
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

        // Usiamo supabaseAdmin (non supabase normale)
        const { error } = await supabaseAdmin.from('chat_log').insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId, 
            status_ai: 'pending',
            ai_response: body
        })

        if (error) {
            console.error("❌ Errore DB:", error)
            // Non blocchiamo la risposta a Meta, altrimenti riprova all'infinito
        } else {
            console.log("💾 Messaggio salvato correttamente nel DB!")
        }
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}