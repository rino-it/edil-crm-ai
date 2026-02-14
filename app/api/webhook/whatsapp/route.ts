import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { processWithGemini } from '@/utils/ai/gemini' // IL CERVELLO
import { sendWhatsAppMessage } from '@/utils/whatsapp' // LA VOCE

// FORZIAMO LA DINAMICITÀ
export const dynamic = 'force-dynamic' 

// 1. GESTIONE VERIFICA (GET) - RIMASTA IDENTICA
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

// 2. RICEZIONE MESSAGGI (POST) - AGGIORNATA CON AI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // --- CREAZIONE CLIENT AMMINISTRATORE (Tuo codice originale) ---
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log("📩 [POST] Nuova notifica da WhatsApp!")
    
    if (body.object === 'whatsapp_business_account') {
      // Estraiamo il messaggio (logica identica a prima)
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

        // 1. SALVIAMO NEL DB (Come prima, ma cambiamo status in 'processing')
        // Usiamo .select().single() per avere subito l'ID della riga creata
        const { data: savedMsg, error } = await supabaseAdmin
            .from('chat_log')
            .insert({
                raw_text: rawContent,
                sender_number: sender,
                media_url: mediaId, 
                status_ai: 'processing', // <-- Cambiato da 'pending' a 'processing'
                ai_response: body // Salviamo il raw json per sicurezza
            })
            .select()
            .single()

        if (error) {
            console.error("❌ Errore DB:", error)
        } else {
            console.log("💾 Messaggio salvato. Avvio Gemini...")

            // 2. ✨ INTELLIGENZA ARTIFICIALE (GEMINI) ✨
            // Chiamiamo la funzione che hai creato prima
            const aiAnalysis = await processWithGemini(rawContent)
            
            console.log("🧠 Analisi Gemini:", aiAnalysis.category)

            // 3. INVIO RISPOSTA WHATSAPP
            // Se Gemini ha preparato una risposta, la inviamo
            if (aiAnalysis.reply_to_user) {
                await sendWhatsAppMessage(sender, aiAnalysis.reply_to_user)
            }

            // 4. AGGIORNAMENTO FINALE DB
            // Salviamo l'analisi completa nel database
            if (savedMsg) {
                await supabaseAdmin
                    .from('chat_log')
                    .update({
                        status_ai: 'completed',
                        ai_response: aiAnalysis, // Sovrascriviamo con i dati puliti di Gemini
                    })
                    .eq('id', savedMsg.id)
                
                console.log("✅ Ciclo completato: Messaggio -> DB -> AI -> WhatsApp -> DB")
            }
        }
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}