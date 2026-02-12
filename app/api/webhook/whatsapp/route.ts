import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// 1. VERIFICA DEL WEBHOOK (Meta chiama questo endpoint quando configuri l'app)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Inventa una password sicura per il webhook (es. "edil-crm-segreto-2024")
  // Dovrai inserirla uguale identica nel pannello di Meta
  const VERIFY_TOKEN = 'edil-crm-segreto-2024'

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificato con successo!')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Token non valido', { status: 403 })
}

// 2. RICEZIONE MESSAGGI (Meta invia qui i messaggi che ricevi su WhatsApp)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    // Controllo rapido se è un messaggio WhatsApp valido
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value
      const message = value?.messages?.[0]

      if (message) {
        // Estraiamo i dati essenziali
        const sender = message.from // Chi ha mandato il messaggio (es. Capocantiere)
        const text = message.text?.body || '' // Il testo del messaggio
        const mediaId = message.image?.id || message.document?.id // Se c'è una foto/pdf
        const type = message.type // 'text', 'image', 'document'

        console.log(`Messaggio ricevuto da ${sender}: ${type}`)

        // Salviamo grezzo nel database per processarlo dopo con l'AI
        const { error } = await supabase.from('chat_log').insert({
            raw_text: text || `[Allegato ${type}]`,
            sender_number: sender,
            media_url: mediaId, // Per ora salviamo l'ID, poi scaricheremo il file
            status_ai: 'pending', // Dice al sistema: "Ehi AI, c'è lavoro per te"
            ai_response: body // Salviamo tutto il JSON per debug (opzionale)
        })

        if (error) console.error('Errore salvataggio DB:', error)
      }
    }

    // Rispondiamo sempre 200 OK a Meta, altrimenti smette di inviarci messaggi
    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('Errore Webhook:', error)
    return new NextResponse('Errore interno', { status: 500 })
  }
}