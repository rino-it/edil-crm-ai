import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { processWithGemini, synthesizeWithData, detectConfirmation } from '@/utils/ai/gemini'
import { sendWhatsAppMessage, downloadMedia } from '@/utils/whatsapp'
import {
  getCantiereData,
  getCantieriAttivi,
  formatCantiereForAI,
  formatCantieriListForAI,
  inserisciMovimento,
} from '@/utils/data-fetcher'

export const dynamic = 'force-dynamic'

// ============================================================
// GET - Verifica webhook Meta
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
// POST - Flusso principale con macchina a stati
//
// STATI (interaction_step in chat_log):
//   idle              → nessuna conversazione attiva
//   waiting_confirm   → DDT analizzato, in attesa di "Sì"
//   waiting_cantiere  → DDT analizzato ma manca il cantiere
//   completed         → DDT salvato con successo
//
// FLUSSO DDT:
//   Foto → Gemini estrae dati → [cantiere trovato?]
//     SÌ → chiede conferma → utente dice "Sì" → INSERT movimenti
//     NO → chiede cantiere → utente scrive nome → chiede conferma → "Sì" → INSERT
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

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

        // =====================================================
        // STEP 0: Recupera lo stato precedente della conversazione
        // =====================================================
        const { data: lastInteraction } = await supabaseAdmin
          .from('chat_log')
          .select('interaction_step, temp_data')
          .eq('sender_number', sender)
          .in('interaction_step', ['waiting_confirm', 'waiting_cantiere'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const pendingStep = lastInteraction?.interaction_step || 'idle'
        const pendingData = lastInteraction?.temp_data || {}

        console.log(`🔄 Stato conversazione: ${pendingStep}`)

        // Variabili per il risultato finale
        let finalReply = ''
        let interactionStep = 'idle'
        let tempData: Record<string, unknown> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let aiAnalysis: any = {}

        // =====================================================
        // CASO A: L'utente sta CONFERMANDO un DDT ("Sì" / "No")
        // =====================================================
        if (pendingStep === 'waiting_confirm' && type === 'text') {
          const confirmation = detectConfirmation(rawContent)

          if (confirmation === 'yes') {
            console.log("✅ Utente conferma! Inserisco movimento...")

            const result = await inserisciMovimento({
              cantiere_id: pendingData.cantiere_id as string,
              tipo: 'materiale',
              descrizione: `DDT ${pendingData.fornitore || 'N/D'}: ${pendingData.materiali || 'Materiali vari'}`,
              importo: (pendingData.importo as number) || 0,
              data_movimento: (pendingData.data as string) || new Date().toISOString().split('T')[0],
              fornitore: pendingData.fornitore as string,
            })

            if (result.success) {
              finalReply = `✅ Registrato! Spesa di €${pendingData.importo} da ${pendingData.fornitore || 'N/D'} salvata su *${pendingData.cantiere_nome}*.\nIl budget è aggiornato automaticamente.`
              interactionStep = 'completed'
            } else {
              finalReply = `❌ Errore nel salvataggio: ${result.error}. Riprova mandando di nuovo la foto.`
              interactionStep = 'idle'
            }

            aiAnalysis = { category: 'ddt', summary: `DDT confermato: €${pendingData.importo} su ${pendingData.cantiere_nome}` }

          } else if (confirmation === 'no') {
            finalReply = "❌ Operazione annullata. Il DDT non è stato registrato."
            interactionStep = 'idle'
            aiAnalysis = { category: 'ddt', summary: 'DDT annullato dall\'utente' }
          } else {
            // Non ha detto né sì né no — spiegare
            finalReply = `Sto aspettando una conferma per il DDT da €${pendingData.importo}.\nRispondi *Sì* per salvare o *No* per annullare.`
            interactionStep = 'waiting_confirm'
            tempData = pendingData
            aiAnalysis = { category: 'ddt', summary: 'In attesa conferma' }
          }
        }

        // =====================================================
        // CASO B: L'utente sta INDICANDO IL CANTIERE
        // =====================================================
        else if (pendingStep === 'waiting_cantiere' && type === 'text') {
          console.log(`🔍 Utente indica cantiere: "${rawContent}"`)

          const cantiere = await getCantiereData(rawContent)

          if (cantiere) {
            finalReply = `Ho trovato *${cantiere.nome}*.\n\nRegistro la spesa di €${pendingData.importo} da ${pendingData.fornitore || 'N/D'}?\n\nRispondi *Sì* per confermare o *No* per annullare.`
            interactionStep = 'waiting_confirm'
            tempData = {
              ...pendingData,
              cantiere_id: cantiere.id,
              cantiere_nome: cantiere.nome,
            }
          } else {
            finalReply = `Non ho trovato nessun cantiere con "${rawContent}".\nRiprova con il nome esatto o scrivi *No* per annullare.`
            interactionStep = 'waiting_cantiere'
            tempData = pendingData
          }

          aiAnalysis = { category: 'ddt', summary: `Ricerca cantiere: ${rawContent}` }
        }

        // =====================================================
        // CASO C: NESSUNO STATO ATTIVO → Flusso normale
        // =====================================================
        else {
          // Download media se presente
          let mediaData = null
          if (mediaId) {
            console.log(`📸 Tipo: ${type} | Media ID: ${mediaId} — download in corso...`)
            mediaData = await downloadMedia(mediaId)
            if (!mediaData) {
              console.warn("⚠️ Download media fallito, proseguo con solo testo")
            }
          }

          // Chiamata Gemini
          const geminiResult = await processWithGemini(rawContent, mediaData)
          aiAnalysis = geminiResult

          console.log("🔍 DEBUG AI FULL:", JSON.stringify(geminiResult))
          console.log(`🧠 Intent: ${geminiResult.category} | Key: ${geminiResult.search_key || 'MANCANTE'} | ${geminiResult.summary}`)

          // -------------------------------------------------
          // SOTTO-CASO C1: DDT rilevato da foto
          // -------------------------------------------------
          if (geminiResult.category === 'ddt' && geminiResult.extracted_data) {
            const dati = geminiResult.extracted_data
            console.log(`📄 DDT rilevato: ${dati.fornitore} | €${dati.importo} | ${dati.materiali}`)

            // Cerchiamo il cantiere (dalla didascalia o dall'indirizzo sul DDT)
            let cantiere = null
            if (dati.cantiere_rilevato) {
              cantiere = await getCantiereData(dati.cantiere_rilevato as string)
            }

            if (cantiere) {
              // Cantiere trovato → chiediamo conferma
              finalReply = `📄 *DDT rilevato*\n\n` +
                `• Fornitore: ${dati.fornitore || 'N/D'}\n` +
                `• Importo: €${dati.importo || 0}\n` +
                `• Materiali: ${dati.materiali || 'N/D'}\n` +
                `• Data: ${dati.data || 'N/D'}\n` +
                `• Cantiere: *${cantiere.nome}*\n\n` +
                `Confermi la registrazione? Rispondi *Sì* o *No*.`
              interactionStep = 'waiting_confirm'
              tempData = {
                fornitore: dati.fornitore,
                importo: dati.importo,
                materiali: dati.materiali,
                data: dati.data,
                numero_ddt: dati.numero_ddt,
                cantiere_id: cantiere.id,
                cantiere_nome: cantiere.nome,
              }
            } else {
              // Cantiere non trovato → chiediamo quale
              finalReply = `📄 *DDT rilevato*\n\n` +
                `• Fornitore: ${dati.fornitore || 'N/D'}\n` +
                `• Importo: €${dati.importo || 0}\n` +
                `• Materiali: ${dati.materiali || 'N/D'}\n` +
                `• Data: ${dati.data || 'N/D'}\n\n` +
                `A quale cantiere lo assegno? Scrivimi il nome.`
              interactionStep = 'waiting_cantiere'
              tempData = {
                fornitore: dati.fornitore,
                importo: dati.importo,
                materiali: dati.materiali,
                data: dati.data,
                numero_ddt: dati.numero_ddt,
              }
            }
          }

          // -------------------------------------------------
          // SOTTO-CASO C2: Richiesta BUDGET (RAG) — logica esistente
          // -------------------------------------------------
          else if (geminiResult.category === 'budget') {
            // Fallback search_key
            if (!geminiResult.search_key) {
              console.warn("⚠️ Gemini 'budget' senza search_key. Fallback...")
              const budgetKeywords = /\b(quanto|ci manca|di budget|budget|su|del|della|sul|speso|spesa|costi|costo|come|siamo|messi|situazione|stato)\b/gi
              const cleaned = rawContent.replace(budgetKeywords, '').replace(/[?!.,]/g, '').trim()
              geminiResult.search_key = cleaned.length >= 3 ? cleaned : '__ALL__'
              console.log(`🔧 Fallback search_key: "${geminiResult.search_key}"`)
            }

            if (geminiResult.search_key) {
              console.log(`🔍 RAG attivato! Cerco dati per: "${geminiResult.search_key}"`)
              let dbContext: string | null = null

              if (geminiResult.search_key === '__ALL__') {
                const cantieri = await getCantieriAttivi()
                if (cantieri.length > 0) {
                  dbContext = formatCantieriListForAI(cantieri)
                  console.log(`📊 Trovati ${cantieri.length} cantieri aperti`)
                }
              } else {
                const cantiere = await getCantiereData(geminiResult.search_key)
                if (cantiere) {
                  dbContext = formatCantiereForAI(cantiere)
                  console.log(`📊 Dati trovati per: ${cantiere.nome}`)
                }
              }

              if (dbContext) {
                console.log("🤖 Seconda chiamata Gemini con dati reali...")
                const finalResponse = await synthesizeWithData(rawContent, dbContext)
                finalReply = finalResponse.reply_to_user
                aiAnalysis = { ...geminiResult, reply_to_user: finalReply, summary: finalResponse.summary }
              } else {
                finalReply = geminiResult.search_key === '__ALL__'
                  ? "Non ho trovato cantieri aperti nel database."
                  : `Non ho trovato nessun cantiere con il nome "${geminiResult.search_key}".`
              }
            }
          }

          // -------------------------------------------------
          // SOTTO-CASO C3: Qualsiasi altro messaggio
          // -------------------------------------------------
          else {
            finalReply = geminiResult.reply_to_user || ''
          }
        }

        // =====================================================
        // STEP FINALE: Invio risposta + salvataggio DB
        // =====================================================
        if (finalReply) {
          await sendWhatsAppMessage(sender, finalReply)
        }

        // Salviamo TUTTO nel chat_log (messaggio + stato + dati temporanei)
        await supabaseAdmin
          .from('chat_log')
          .insert({
            raw_text: rawContent,
            sender_number: sender,
            media_url: mediaId,
            status_ai: 'completed',
            ai_response: aiAnalysis,
            interaction_step: interactionStep,
            temp_data: Object.keys(tempData).length > 0 ? tempData : null,
          })

        console.log(`✅ Ciclo completato | Step: ${interactionStep} | Risposta: "${finalReply.substring(0, 50)}..."`)
      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 200 })
  }
}
