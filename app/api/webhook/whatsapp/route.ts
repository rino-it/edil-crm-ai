import { createClient } from '@/utils/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

// FORZIAMO LA DINAMICITÀ (Fondamentale per i Webhook!)
export const dynamic = 'force-dynamic' 

// 1. VERIFICA DEL WEBHOOK
export async function GET(request: NextRequest) {
  try {
    // Usiamo nextUrl che è più affidabile su Vercel
    const searchParams = request.nextUrl.searchParams
    
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    const VERIFY_TOKEN = 'edil-crm-segreto-2024'

    console.log("🔍 [WEBHOOK GET] URL Completo:", request.url)
    console.log(`➡️ Mode: '${mode}', Token: '${token}', Challenge: '${challenge}'`)

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("✅ Verifica RIUSCITA.")
      // Rispondiamo SOLO con la challenge, status 200, plain text
      return new NextResponse(challenge, { status: 200 })
    } else {
      console.log("❌ Verifica FALLITA.")
      return new NextResponse('Token non valido', { status: 403 })
    }
  } catch (error) {
    console.error("🔥 Errore GET:", error)
    return new NextResponse('Errore server', { status: 500 })
  }
}

// 2. RICEZIONE MESSAGGI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    // Debug rapido per vedere se Meta ci parla
    console.log("📩 [POST] Body ricevuto (estratto):", JSON.stringify(body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || "Nessun messaggio"))

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

        console.log(`👤 Mittente: ${sender} | Tipo: ${type}`)

        // Salvataggio DB
        await supabase.from('chat_log').insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId, 
            status_ai: 'pending',
            ai_response: body
        })
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}