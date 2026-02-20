import { createClient } from '@supabase/supabase-js'
import { NextResponse, NextRequest } from 'next/server'
import { processWithGemini, synthesizeWithData, detectConfirmation } from '@/utils/ai/gemini'
import { sendWhatsAppMessage, downloadMedia } from '@/utils/whatsapp'
import { uploadFileToSupabase } from '@/utils/supabase/upload'
import {
  getCantiereData,
  getCantieriAttivi,
  formatCantiereForAI,
  formatCantieriListForAI,
  inserisciMovimento,
  risolviPersonale,
  inserisciPresenze,
  type PersonaRisolta,
  type PresenzaInput,
} from '@/utils/data-fetcher'

export const dynamic = 'force-dynamic'

// ============================================================
// PARAMETRI GLOBALI — Fallback hardcoded se tabella non esiste
// ============================================================
interface ParametriGlobali {
  moltiplicatore_straordinario: number  // es. 1.25 = +25%
  soglia_ore_straordinario: number      // es. 8h/giorno
  soglia_km_trasferta: number           // es. 30 km
  indennita_trasferta: number           // es. €25/giorno
}

const PARAMETRI_FALLBACK: ParametriGlobali = {
  moltiplicatore_straordinario: 1.25,
  soglia_ore_straordinario: 8,
  soglia_km_trasferta: 30,
  indennita_trasferta: 25.00,
}

async function getParametriGlobali(): Promise<ParametriGlobali> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data, error } = await supabase
      .from('parametri_globali')
      .select('moltiplicatore_straordinario, soglia_ore_straordinario, soglia_km_trasferta, indennita_trasferta')
      .eq('id', 1)
      .single()

    if (error || !data) {
      console.warn('⚠️ parametri_globali non trovati, uso fallback hardcoded')
      return PARAMETRI_FALLBACK
    }

    return {
      moltiplicatore_straordinario: data.moltiplicatore_straordinario ?? PARAMETRI_FALLBACK.moltiplicatore_straordinario,
      soglia_ore_straordinario:     data.soglia_ore_straordinario     ?? PARAMETRI_FALLBACK.soglia_ore_straordinario,
      soglia_km_trasferta:          data.soglia_km_trasferta          ?? PARAMETRI_FALLBACK.soglia_km_trasferta,
      indennita_trasferta:          data.indennita_trasferta          ?? PARAMETRI_FALLBACK.indennita_trasferta,
    }
  } catch {
    console.warn('⚠️ Errore lettura parametri_globali, uso fallback hardcoded')
    return PARAMETRI_FALLBACK
  }
}

// ============================================================
// CALCOLO COSTO REALE — Straordinari + Trasferta
// ============================================================
interface CostoRealeResult {
  costo_calcolato: number
  ore_ordinarie: number
  ore_straordinarie: number
  trasferta_applicata: boolean
  dettaglio: string
}

function calcolaPresenzeConCostoReale(
  trovati: PersonaRisolta[],
  ore: number,
  kmDaSede: number,
  params: ParametriGlobali,
  descrizione: string | null
): PresenzaInput[] & { _meta: CostoRealeResult[] } {
  const metas: CostoRealeResult[] = []

  const rows = trovati.map((t) => {
    const costoOrario = t.personale.costo_orario

    const oreOrdinarie    = Math.min(ore, params.soglia_ore_straordinario)
    const oreStraordinarie = Math.max(ore - params.soglia_ore_straordinario, 0)

    const costoOrdinario      = oreOrdinarie * costoOrario
    const costoStraordinario  = oreStraordinarie * costoOrario * params.moltiplicatore_straordinario
    const costoManodopera     = costoOrdinario + costoStraordinario

    const trasfertaApplicata = kmDaSede > params.soglia_km_trasferta
    const bonusTrasferta     = trasfertaApplicata ? params.indennita_trasferta : 0

    const costoCalcolato = costoManodopera + bonusTrasferta

    let dettaglio = `${t.personale.nome}: ${oreOrdinarie}h ord. × €${costoOrario}/h`
    if (oreStraordinarie > 0) {
      dettaglio += ` + ${oreStraordinarie}h str. × €${(costoOrario * params.moltiplicatore_straordinario).toFixed(2)}/h`
    }
    if (trasfertaApplicata) {
      dettaglio += ` + trasferta €${params.indennita_trasferta}`
    }
    dettaglio += ` = €${costoCalcolato.toFixed(2)}`

    metas.push({
      costo_calcolato: costoCalcolato,
      ore_ordinarie: oreOrdinarie,
      ore_straordinarie: oreStraordinarie,
      trasferta_applicata: trasfertaApplicata,
      dettaglio,
    })

    return {
      cantiere_id:    '',
      personale_id:   t.personale.id,
      ore,
      descrizione:     descrizione || undefined,
      costo_calcolato: costoCalcolato,
    } satisfies PresenzaInput
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(rows as any)._meta = metas
  return rows as PresenzaInput[] & { _meta: CostoRealeResult[] }
}

// ============================================================
// HELPERS PREVENTIVAZIONE (Ambiguity Resolver)
// ============================================================
async function getProssimaVoceDaValidare(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin
    .from('computo_voci')
    .select(`
      id, descrizione, quantita, unita_misura, ai_prezzo_stimato, cantiere_id,
      cantieri!inner(nome)
    `)
    .eq('stato_validazione', 'da_validare')
    .not('ai_prezzo_stimato', 'is', null)
    .limit(1)
    .single()

  if (error || !data) return null;
  return data;
}

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
// POST - Flusso principale
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

        let mediaData = null
        let uploadedFileUrl: string | null = null 

        if (mediaId) {
          mediaData = await downloadMedia(mediaId)
          if (mediaData) {
             const extension = mediaData.mimeType.split('/')[1] || 'jpg';
             const fileName = `whatsapp_${mediaId}.${extension}`;
             uploadedFileUrl = await uploadFileToSupabase(mediaData.buffer, fileName, mediaData.mimeType);
          }
        }

        // --- INTERCETTAZIONE RAPIDA PREVENTIVI (Nuovo Ramo) ---
        // Se l'utente scrive "preventivi" o "valida", bypassiamo Gemini per velocizzare
        const textLower = rawContent.trim().toLowerCase();
        if (pendingStep === 'idle' && (textLower.includes('preventivi') || textLower.includes('valida') || textLower.includes('prezzi'))) {
            const voce = await getProssimaVoceDaValidare(supabaseAdmin);
            
            if (voce) {
                const finalReply = `🏗️ *Preventivo: ${voce.cantieri.nome}*\n\n` +
                                   `Lavorazione: *${voce.descrizione}*\n` +
                                   `Q.tà: ${voce.quantita} ${voce.unita_misura}\n` +
                                   `Stima AI: *€${voce.ai_prezzo_stimato}*\n\n` +
                                   `Confermi questa stima? Rispondi *Sì*, oppure scrivimi il prezzo corretto (es. *15.50*).`;
                
                await sendWhatsAppMessage(sender, finalReply);
                await supabaseAdmin.from('chat_log').insert({
                    raw_text: rawContent, sender_number: sender, status_ai: 'completed', interaction_step: 'waiting_confirm_preventivo', temp_data: { voce_id: voce.id, cantiere_id: voce.cantiere_id, prezzo_stimato: voce.ai_prezzo_stimato }
                });
                return new NextResponse('Ricevuto', { status: 200 });
            } else {
                await sendWhatsAppMessage(sender, "✅ Nessuna stima in sospeso. Tutti i preventivi sono aggiornati.");
                return new NextResponse('Ricevuto', { status: 200 });
            }
        }

        // =====================================================
        // CASO A-TER: L'utente sta VALIDANDO UN PREVENTIVO
        // =====================================================
        if (pendingStep === 'waiting_confirm_preventivo' && type === 'text') {
            const confirmation = detectConfirmation(rawContent);
            let prezzoFinale = pendingData.prezzo_stimato;
            let stato = 'confermato';

            if (confirmation === 'yes') {
                // Prezzo confermato (mantiene la stima)
            } else if (confirmation === 'no') {
                await sendWhatsAppMessage(sender, "❌ Ok, dimmi tu il prezzo corretto (es. 12.50) o scrivi *Stop* per uscire.");
                await supabaseAdmin.from('chat_log').insert({
                    raw_text: rawContent, sender_number: sender, status_ai: 'completed', interaction_step: 'waiting_confirm_preventivo', temp_data: pendingData
                });
                return new NextResponse('Ricevuto', { status: 200 });
            } else if (textLower === 'stop') {
                await sendWhatsAppMessage(sender, "Operazione interrotta.");
                await supabaseAdmin.from('chat_log').insert({ raw_text: rawContent, sender_number: sender, interaction_step: 'idle' });
                return new NextResponse('Ricevuto', { status: 200 });
            } else {
                // Tenta di estrarre un numero se l'utente digita "15", "15,50" ecc.
                const parseNum = parseFloat(rawContent.replace(',', '.'));
                if (!isNaN(parseNum)) {
                    prezzoFinale = parseNum;
                    stato = 'modificato';
                } else {
                    await sendWhatsAppMessage(sender, "Non ho capito. Rispondi *Sì* per confermare, scrivi un numero, o scrivi *Stop*.");
                    await supabaseAdmin.from('chat_log').insert({
                        raw_text: rawContent, sender_number: sender, status_ai: 'completed', interaction_step: 'waiting_confirm_preventivo', temp_data: pendingData
                    });
                    return new NextResponse('Ricevuto', { status: 200 });
                }
            }

            // Aggiorna il Database (Computo)
            await supabaseAdmin.from('computo_voci').update({
                prezzo_unitario: prezzoFinale,
                stato_validazione: stato
            }).eq('id', pendingData.voce_id);

            // Cerca la prossima voce
            const prossimaVoce = await getProssimaVoceDaValidare(supabaseAdmin);
            
            let reply = `✅ Prezzo salvato: €${prezzoFinale}.`;
            let nextStep = 'idle';
            let nextData = null;

            if (prossimaVoce) {
                reply += `\n\nProssima voce in *${prossimaVoce.cantieri.nome}*:\nLavorazione: *${prossimaVoce.descrizione}*\nStima AI: *€${prossimaVoce.ai_prezzo_stimato}*\nConfermi o modifichi?`;
                nextStep = 'waiting_confirm_preventivo';
                nextData = { voce_id: prossimaVoce.id, cantiere_id: prossimaVoce.cantiere_id, prezzo_stimato: prossimaVoce.ai_prezzo_stimato };
            } else {
                reply += `\n🎉 Hai finito! Tutte le voci sono state validate.`;
            }

            await sendWhatsAppMessage(sender, reply);
            await supabaseAdmin.from('chat_log').insert({
                raw_text: rawContent, sender_number: sender, status_ai: 'completed', interaction_step: nextStep, temp_data: nextData
            });
            return new NextResponse('Ricevuto', { status: 200 });
        }


        // Chiamata Gemini (Flusso Normale per DDT, Budget, Presenze)
        const geminiResult = await processWithGemini(rawContent, mediaData)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let aiAnalysis: any = geminiResult
        let finalReply = ''
        let interactionStep = 'idle'
        let tempData: Record<string, unknown> = {}

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
              file_url: (pendingData.file_url as string) || null,
              numero_documento: (pendingData.numero_ddt as string) || null
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
            finalReply = `Sto aspettando una conferma per il DDT da €${pendingData.importo}.\nRispondi *Sì* per salvare o *No* per annullare.`
            interactionStep = 'waiting_confirm'
            tempData = pendingData
            aiAnalysis = { category: 'ddt', summary: 'In attesa conferma' }
          }
        }

        else if (pendingStep === 'waiting_confirm_presenze' && type === 'text') {
          const confirmation = detectConfirmation(rawContent)

          if (confirmation === 'yes') {
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

        else if (pendingStep === 'waiting_cantiere' && type === 'text') {
          const confirmation = detectConfirmation(rawContent)
          if (confirmation === 'no') {
            finalReply = "❌ Operazione annullata."
            interactionStep = 'idle'
            aiAnalysis = { category: pendingData._flow_type as string || 'altro', summary: 'Annullato' }
          } else {
            const cantiere = await getCantiereData(rawContent)

            if (cantiere) {
              if (pendingData._flow_type === 'presenze') {
                const nomi = (pendingData.nomi_rilevati as string[]) || []
                const ore = (pendingData.ore as number) || 0
                const { trovati, nonTrovati } = await risolviPersonale(nomi, sender)

                if (trovati.length === 0) {
                  finalReply = `Ho trovato il cantiere *${cantiere.nome}*, ma non riconosco nessuno dei nomi indicati: ${nonTrovati.join(', ')}.\n\nVerifica che siano registrati nel sistema.`
                  interactionStep = 'idle'
                } else {
                  const params = await getParametriGlobali()
                  const kmDaSede = (cantiere as unknown as { km_da_sede?: number }).km_da_sede ?? 0
                  const calcolati = calcolaPresenzeConCostoReale(
                    trovati,
                    ore,
                    kmDaSede,
                    params,
                    (pendingData.descrizione_lavoro as string) || null
                  )
                  const presenzeRows = calcolati.map(r => ({ ...r, cantiere_id: cantiere.id }))
                  const metas = calcolati._meta

                  const costoTotale = presenzeRows.reduce((acc, p) => acc + p.costo_calcolato, 0)
                  const listaNomi = metas.map(m => m.dettaglio).join('\n• ')

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
                finalReply = `Ho trovato *${cantiere.nome}*.\n\nRegistro la spesa di €${pendingData.importo} da ${pendingData.fornitore || 'N/D'}?\n\nRispondi *Sì* per confermare o *No* per annullare.`
                interactionStep = 'waiting_confirm'
                tempData = {
                  ...pendingData,
                  cantiere_id: cantiere.id,
                  cantiere_nome: cantiere.nome,
                  file_url: pendingData.file_url,
                  numero_ddt: pendingData.numero_ddt
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

        else {
          if (geminiResult.category === 'ddt' && geminiResult.extracted_data) {
            const dati = geminiResult.extracted_data
            let cantiere = null
            if (dati.cantiere_rilevato) {
              cantiere = await getCantiereData(dati.cantiere_rilevato as string)
            }

            if (cantiere) {
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
                file_url: uploadedFileUrl
              }
            } else {
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
                file_url: uploadedFileUrl
              }
            }
          }

          else if (geminiResult.category === 'presenze' && geminiResult.extracted_data) {
            const dati = geminiResult.extracted_data
            const nomi = (dati.nomi_rilevati as string[]) || []
            const ore = (dati.ore as number) || 0
            const cantiereNome = dati.cantiere_rilevato as string

            let cantiere = null
            if (cantiereNome) {
              cantiere = await getCantiereData(cantiereNome)
            }

            if (cantiere) {
              const { trovati, nonTrovati } = await risolviPersonale(nomi, sender)

              if (trovati.length === 0) {
                finalReply = `Non riconosco nessuno dei nomi indicati: ${nonTrovati.join(', ')}.\n\nAssicurati che siano registrati nel sistema.`
                interactionStep = 'idle'
              } else {
                const params = await getParametriGlobali()
                const kmDaSede = (cantiere as unknown as { km_da_sede?: number }).km_da_sede ?? 0
                const calcolati = calcolaPresenzeConCostoReale(
                  trovati,
                  ore,
                  kmDaSede,
                  params,
                  (dati.descrizione_lavoro as string) || null
                )
                const presenzeRows = calcolati.map(r => ({ ...r, cantiere_id: cantiere!.id }))
                const metas = calcolati._meta

                const costoTotale = presenzeRows.reduce((acc, p) => acc + p.costo_calcolato, 0)
                const listaNomi = metas.map(m => m.dettaglio).join('\n• ')

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

          else if (geminiResult.category === 'budget') {
            if (!geminiResult.search_key) {
              const budgetKeywords = /\b(quanto|ci manca|di budget|budget|su|del|della|sul|speso|spesa|costi|costo|come|siamo|messi|situazione|stato)\b/gi
              const cleaned = rawContent.replace(budgetKeywords, '').replace(/[?!.,]/g, '').trim()
              geminiResult.search_key = cleaned.length >= 3 ? cleaned : '__ALL__'
            }

            if (geminiResult.search_key) {
              let dbContext: string | null = null

              if (geminiResult.search_key === '__ALL__') {
                const cantieri = await getCantieriAttivi()
                if (cantieri.length > 0) {
                  dbContext = formatCantieriListForAI(cantieri)
                }
              } else {
                const cantiere = await getCantiereData(geminiResult.search_key)
                if (cantiere) {
                  dbContext = formatCantiereForAI(cantiere)
                }
              }

              if (dbContext) {
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

          else {
            finalReply = geminiResult.reply_to_user || ''
          }
        }

        if (finalReply) {
          await sendWhatsAppMessage(sender, finalReply)
        }

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

      }
    }

    return new NextResponse('Ricevuto', { status: 200 })
  } catch (error) {
    console.error('🔥 Errore POST:', error)
    return new NextResponse('Errore interno', { status: 200 })
  }
}