import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { processWithGemini, synthesizeWithData, detectConfirmation } from '@/utils/ai/gemini'
import { sendWhatsAppMessage, downloadMedia } from '@/utils/whatsapp'
import { uploadFileToSupabase } from '@/utils/supabase/upload' // <--- 1. IMPORT NUOVO
import {
  getCantiereData,
  getCantieriAttivi,
  formatCantiereForAI,
  formatCantieriListForAI,
  inserisciMovimento,
  risolviPersonale,
  inserisciPresenze,
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
              file_url: (pendingData.file_url as string) || null // <--- 2. PASSIAMO L'URL AL DB (RECUPERATO DAI DATI TEMPORANEI)
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
        // CASO A-BIS: Conferma PRESENZE ("Sì" / "No")
        // =====================================================
        else if (pendingStep === 'waiting_confirm_presenze' && type === 'text') {
          const confirmation = detectConfirmation(rawContent)

          if (confirmation === 'yes') {
            console.log("✅ Utente conferma presenze! Inserisco...")

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const presenzeRows = (pendingData.presenze_da_inserire as any[]) || []
            const result = await inserisciPresenze(presenzeRows)

            if (result.success) {
              const costoTotale = presenzeRows.reduce((acc: number, p: any) => acc + (p.costo_calcolato || 0), 0)
              finalReply = `✅ Presenze registrate!\n\n` +
                `• ${result.inserite} rapportino/i salvati su *${pendingData.cantiere_nome}*\n` +
                `• Costo manodopera: €${costoTotale.toFixed(2)}`
              interactionStep = 'completed'
            } else {
              finalReply = `❌ Errore nel salvataggio: ${result.error}`
              interactionStep = 'idle'
            }

            aiAnalysis = { category: 'presenze', summary: `Presenze confermate su ${pendingData.cantiere_nome}` }

          } else if (confirmation === 'no') {
            finalReply = "❌ Rapportino annullato."
            interactionStep = 'idle'
            aiAnalysis = { category: 'presenze', summary: 'Presenze annullate' }
          } else {
            finalReply = `Sto aspettando conferma per le presenze.\nRispondi *Sì* per salvare o *No* per annullare.`
            interactionStep = 'waiting_confirm_presenze'
            tempData = pendingData
            aiAnalysis = { category: 'presenze', summary: 'In attesa conferma presenze' }
          }
        }

        // =====================================================
        // CASO B: L'utente sta INDICANDO IL CANTIERE (DDT o Presenze)
        // =====================================================
        else if (pendingStep === 'waiting_cantiere' && type === 'text') {
          // Controlla se è un "No" per annullare
          const confirmation = detectConfirmation(rawContent)
          if (confirmation === 'no') {
            finalReply = "❌ Operazione annullata."
            interactionStep = 'idle'
            aiAnalysis = { category: pendingData._flow_type as string || 'altro', summary: 'Annullato' }
          } else {
            console.log(`🔍 Utente indica cantiere: "${rawContent}"`)
            const cantiere = await getCantiereData(rawContent)

            if (cantiere) {
              // Controlliamo se è un flusso DDT o Presenze
              if (pendingData._flow_type === 'presenze') {
                // Flusso presenze: risolviamo le persone e prepariamo la conferma
                const nomi = (pendingData.nomi_rilevati as string[]) || []
                const ore = (pendingData.ore as number) || 0
                const { trovati, nonTrovati } = await risolviPersonale(nomi, sender)

                if (trovati.length === 0) {
                  finalReply = `Ho trovato il cantiere *${cantiere.nome}*, ma non riconosco nessuno dei nomi indicati: ${nonTrovati.join(', ')}.\n\nVerifica che siano registrati nel sistema.`
                  interactionStep = 'idle'
                } else {
                  const presenzeRows = trovati.map(t => ({
                    cantiere_id: cantiere.id,
                    personale_id: t.personale.id,
                    ore,
                    descrizione: (pendingData.descrizione_lavoro as string) || null,
                    costo_calcolato: ore * t.personale.costo_orario,
                  }))

                  const costoTotale = presenzeRows.reduce((acc, p) => acc + p.costo_calcolato, 0)
                  const listaNomi = trovati.map(t => `${t.personale.nome} (${ore}h × €${t.personale.costo_orario}/h)`).join('\n• ')

                  let msg = `👷 *Rapportino*\n\n• ${listaNomi}\n\n📍 Cantiere: *${cantiere.nome}*\n💰 Costo totale: €${costoTotale.toFixed(2)}`
                  if (nonTrovati.length > 0) {
                    msg += `\n\n⚠️ Non trovati: ${nonTrovati.join(', ')}`
                  }
                  msg += `\n\nConfermi? Rispondi *Sì* o *No*.`

                  finalReply = msg
                  interactionStep = 'waiting_confirm_presenze'
                  tempData = {
                    ...pendingData,
                    cantiere_id: cantiere.id,
                    cantiere_nome: cantiere.nome,
                    presenze_da_inserire: presenzeRows,
                  }
                }
              } else {
                // Flusso DDT (come prima)
                finalReply = `Ho trovato *${cantiere.nome}*.\n\nRegistro la spesa di €${pendingData.importo} da ${pendingData.fornitore || 'N/D'}?\n\nRispondi *Sì* per confermare o *No* per annullare.`
                interactionStep = 'waiting_confirm'
                tempData = {
                  ...pendingData,
                  cantiere_id: cantiere.id,
                  cantiere_nome: cantiere.nome,
                  file_url: pendingData.file_url // MANTENIAMO L'URL SE C'ERA
                }
              }
            } else {
              finalReply = `Non ho trovato nessun cantiere con "${rawContent}".\nRiprova con il nome esatto o scrivi *No* per annullare.`
              interactionStep = 'waiting_cantiere'
              tempData = pendingData
            }

            aiAnalysis = { category: pendingData._flow_type as string || 'altro', summary: `Ricerca cantiere: ${rawContent}` }
          }
        }

        // =====================================================
        // CASO C: NESSUNO STATO ATTIVO → Flusso normale
        // =====================================================
        else {
          // Download media se presente
          let mediaData = null
          let uploadedFileUrl: string | null = null // Variabile per l'URL

          if (mediaId) {
            console.log(`📸 Tipo: ${type} | Media ID: ${mediaId} — download in corso...`)
            mediaData = await downloadMedia(mediaId)
            
            // <--- 3. LOGICA DI UPLOAD INSERITA QUI (CON FIX .buffer)
            if (mediaData) {
               const extension = mediaData.mimeType.split('/')[1] || 'jpg';
               const fileName = `whatsapp_${mediaId}.${extension}`;
               
               // Carichiamo su Supabase
               uploadedFileUrl = await uploadFileToSupabase(
                  mediaData.buffer, // <--- USIAMO .buffer (non .data)
                  fileName,
                  mediaData.mimeType
               );
               console.log("🌍 Foto caricata su Cloud:", uploadedFileUrl);
            }
            
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
                _flow_type: 'ddt',
                fornitore: dati.fornitore,
                importo: dati.importo,
                materiali: dati.materiali,
                data: dati.data,
                numero_ddt: dati.numero_ddt,
                cantiere_id: cantiere.id,
                cantiere_nome: cantiere.nome,
                file_url: uploadedFileUrl // <--- SALVIAMO URL NEI DATI TEMPORANEI
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
                _flow_type: 'ddt',
                fornitore: dati.fornitore,
                importo: dati.importo,
                materiali: dati.materiali,
                data: dati.data,
                numero_ddt: dati.numero_ddt,
                file_url: uploadedFileUrl // <--- SALVIAMO URL ANCHE QUI
              }
            }
          }

          // -------------------------------------------------
          // SOTTO-CASO C4: PRESENZE / RAPPORTINO
          // -------------------------------------------------
          else if (geminiResult.category === 'presenze' && geminiResult.extracted_data) {
            const dati = geminiResult.extracted_data
            const nomi = (dati.nomi_rilevati as string[]) || []
            const ore = (dati.ore as number) || 0
            const cantiereNome = dati.cantiere_rilevato as string

            console.log(`👷 Presenze: ${nomi.join(', ')} | ${ore}h | Cantiere: ${cantiereNome || 'N/D'}`)

            // Cerchiamo il cantiere
            let cantiere = null
            if (cantiereNome) {
              cantiere = await getCantiereData(cantiereNome)
            }

            if (cantiere) {
              // Cantiere trovato → risolviamo le persone
              const { trovati, nonTrovati } = await risolviPersonale(nomi, sender)

              if (trovati.length === 0) {
                finalReply = `Non riconosco nessuno dei nomi indicati: ${nonTrovati.join(', ')}.\n\nAssicurati che siano registrati nel sistema.`
                interactionStep = 'idle'
              } else {
                // Prepariamo le righe da inserire
                const presenzeRows = trovati.map(t => ({
                  cantiere_id: cantiere!.id,
                  personale_id: t.personale.id,
                  ore,
                  descrizione: (dati.descrizione_lavoro as string) || null,
                  costo_calcolato: ore * t.personale.costo_orario,
                }))

                const costoTotale = presenzeRows.reduce((acc, p) => acc + p.costo_calcolato, 0)
                const listaNomi = trovati.map(t => `${t.personale.nome} (${ore}h × €${t.personale.costo_orario}/h)`).join('\n• ')

                let msg = `👷 *Rapportino*\n\n• ${listaNomi}\n\n📍 Cantiere: *${cantiere.nome}*`
                if (dati.descrizione_lavoro) {
                  msg += `\n🔧 Lavoro: ${dati.descrizione_lavoro}`
                }
                msg += `\n💰 Costo totale: €${costoTotale.toFixed(2)}`
                if (nonTrovati.length > 0) {
                  msg += `\n\n⚠️ Non trovati: ${nonTrovati.join(', ')}`
                }
                msg += `\n\nConfermi? Rispondi *Sì* o *No*.`

                finalReply = msg
                interactionStep = 'waiting_confirm_presenze'
                tempData = {
                  _flow_type: 'presenze',
                  nomi_rilevati: nomi,
                  ore,
                  descrizione_lavoro: dati.descrizione_lavoro,
                  cantiere_id: cantiere.id,
                  cantiere_nome: cantiere.nome,
                  presenze_da_inserire: presenzeRows,
                }
              }
            } else {
              // Cantiere non trovato → chiediamo
              finalReply = `👷 Ho capito: ${nomi.length} persona/e, ${ore} ore${dati.descrizione_lavoro ? ', ' + dati.descrizione_lavoro : ''}.\n\nA quale cantiere assegno le ore? Scrivimi il nome.`
              interactionStep = 'waiting_cantiere'
              tempData = {
                _flow_type: 'presenze',
                nomi_rilevati: nomi,
                ore,
                descrizione_lavoro: dati.descrizione_lavoro,
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