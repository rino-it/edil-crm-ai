import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { processWithGemini, synthesizeWithData } from '@/utils/ai/gemini'
import { sendWhatsAppMessage, downloadMedia } from '@/utils/whatsapp'
import {
  getCantiereData,
  getCantieriAttivi,
  formatCantiereForAI,
  formatCantieriListForAI,
} from '@/utils/data-fetcher'

export const dynamic = 'force-dynamic'

// ============================================================
// GET - Verifica webhook Meta (rimane identico)
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (!mode || !token) {
      return new NextResponse('Webhook EdilCRM attivo.', { status: 200 })
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

// ============================================================
// POST - Ricezione messaggi WhatsApp → DB → Gemini → Risposta
// Flusso completo con RAG:
//   Messaggio → DB → Download Media → Gemini (intent detection)
//   → [se budget] Query DB cantieri → Gemini (sintesi dati reali)
//   → Risposta WA → Update DB
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Client Supabase con Service Role (bypassa RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    console.log("📩 [POST] Nuova notifica da WhatsApp!")

    if (body.object === 'whatsapp_business_account') {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

      if (message) {
        const sender = message.from
        const type = message.type

        let rawContent = ''
        let mediaId: string | null = null

        // --- Estrazione dati in base al tipo di messaggio ---
        if (type === 'text') {
          rawContent = message.text?.body || ''
        } else if (type === 'image') {
          rawContent = message.image?.caption || '[FOTO SENZA DIDASCALIA]'
          mediaId = message.image?.id
        } else if (type === 'document') {
          rawContent = message.document?.caption || message.document?.filename || '[DOCUMENTO]'
          mediaId = message.document?.id
        }

        console.log(`👤 Mittente: ${sender} | Tipo: ${type} | Contenuto: ${rawContent}`)

        // 1. SALVATAGGIO DB (stato: processing)
        const { data: savedMsg, error } = await supabaseAdmin
          .from('chat_log')
          .insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId,
            status_ai: 'processing',
          })
          .select()
          .single()

        if (error) {
          console.error("❌ Errore DB:", error)
        } else {
          console.log("💾 Messaggio salvato. Avvio pipeline AI...")

          // 2. DOWNLOAD MEDIA (se presente)
          let mediaData = null

          if (mediaId) {
            console.log(`📸 Tipo: ${type} | Media ID: ${mediaId} — download in corso...`)
            mediaData = await downloadMedia(mediaId)

            if (!mediaData) {
              console.warn("⚠️ Download media fallito, proseguo con solo testo")
            }
          }

          // 3. ANALISI GEMINI - Prima chiamata (intent detection)
          let aiAnalysis = await processWithGemini(rawContent, mediaData)

          // DEBUG: Log completo della risposta Gemini per diagnostica
          console.log("🔍 DEBUG AI FULL:", JSON.stringify(aiAnalysis))
          console.log(`🧠 Intent: ${aiAnalysis.category} | Key: ${aiAnalysis.search_key || 'MANCANTE'} | ${aiAnalysis.summary}`)

          // =====================================================
          // 4. RAG: Se Gemini ha rilevato una richiesta "budget",
          //    cerchiamo i dati reali nel DB e rigeneriamo la risposta
          // =====================================================

          // FALLBACK: Se Gemini dice "budget" ma non ha estratto search_key,
          // proviamo a estrarre il nome del cantiere dal testo originale
          if (aiAnalysis.category === 'budget' && !aiAnalysis.search_key) {
            console.warn("⚠️ Gemini ha rilevato 'budget' ma senza search_key. Attivo fallback...")

            // Parole chiave da rimuovere per isolare il nome del cantiere
            const budgetKeywords = /\b(quanto|ci manca|di budget|budget|su|del|della|sul|speso|spesa|costi|costo|come|siamo|messi|situazione|stato)\b/gi
            const cleaned = rawContent.replace(budgetKeywords, '').replace(/[?!.,]/g, '').trim()

            if (cleaned.length >= 3) {
              aiAnalysis.search_key = cleaned
              console.log(`🔧 Fallback search_key estratta dal testo: "${cleaned}"`)
            } else {
              // Se non riusciamo a estrarre nulla, cerchiamo tutti
              aiAnalysis.search_key = '__ALL__'
              console.log("🔧 Fallback: nessun nome estraibile, uso __ALL__")
            }
          }

          if (aiAnalysis.category === 'budget' && aiAnalysis.search_key) {
            console.log(`🔍 RAG attivato! Cerco dati per: "${aiAnalysis.search_key}"`)

            let dbContext: string | null = null

            if (aiAnalysis.search_key === '__ALL__') {
              // Panoramica di tutti i cantieri aperti
              const cantieri = await getCantieriAttivi()
              if (cantieri.length > 0) {
                dbContext = formatCantieriListForAI(cantieri)
                console.log(`📊 Trovati ${cantieri.length} cantieri aperti`)
              }
            } else {
              // Cantiere specifico
              const cantiere = await getCantiereData(aiAnalysis.search_key)
              if (cantiere) {
                dbContext = formatCantiereForAI(cantiere)
                console.log(`📊 Dati trovati per: ${cantiere.nome}`)
              }
            }

            if (dbContext) {
              // Seconda chiamata Gemini: sintetizza i dati reali in linguaggio naturale
              console.log("🤖 Seconda chiamata Gemini con dati reali...")
              const finalResponse = await synthesizeWithData(rawContent, dbContext)

              // Sovrascriviamo la risposta con quella basata sui dati
              aiAnalysis = {
                ...aiAnalysis,
                reply_to_user: finalResponse.reply_to_user,
                summary: finalResponse.summary,
              }
            } else {
              // Cantiere non trovato nel DB
              aiAnalysis.reply_to_user = aiAnalysis.search_key === '__ALL__'
                ? "Non ho trovato cantieri aperti nel database. Verifica che i dati siano stati inseriti."
                : `Non ho trovato nessun cantiere con il nome "${aiAnalysis.search_key}". Controlla l'ortografia o dimmi il nome esatto.`

              console.warn(`⚠️ Nessun dato trovato per: "${aiAnalysis.search_key}"`)
            }
          }

          // 5. INVIO RISPOSTA WHATSAPP
          if (aiAnalysis.reply_to_user) {
            await sendWhatsAppMessage(sender, aiAnalysis.reply_to_user)
          }

          // 6. AGGIORNAMENTO FINALE DB
          if (savedMsg) {
            await supabaseAdmin
              .from('chat_log')
              .update({
                status_ai: 'completed',
                ai_response: aiAnalysis,
              })
              .eq('id', savedMsg.id)

            console.log("✅ Ciclo completato: Messaggio → DB → AI → [RAG] → WhatsApp → DB")
          }
        }
      }
    }

    // Rispondiamo SEMPRE 200 a Meta per evitare retry
    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 200 })
  }
}
