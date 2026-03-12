'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export interface FatturaApertaSoggetto {
  id: string
  fattura_riferimento: string | null
  descrizione: string | null
  importo_totale: number
  importo_pagato: number
  residuo: number
  stato: string
  data_scadenza: string | null
  data_emissione: string | null
  tipo: string
  cantiere_nome: string | null
}

export async function getFattureAperteSoggetto(soggettoId: string): Promise<FatturaApertaSoggetto[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('id, fattura_riferimento, descrizione, importo_totale, importo_pagato, stato, data_scadenza, data_emissione, tipo, cantieri(nome)')
    .eq('soggetto_id', soggettoId)
    .neq('stato', 'pagato')
    .or('fonte.neq.mutuo,fonte.is.null')
    .order('data_scadenza', { ascending: true })

  if (error || !data) return []

  return data.map((s: any) => ({
    id: s.id,
    fattura_riferimento: s.fattura_riferimento,
    descrizione: s.descrizione,
    importo_totale: Number(s.importo_totale) || 0,
    importo_pagato: Number(s.importo_pagato) || 0,
    residuo: Math.round(((Number(s.importo_totale) || 0) - (Number(s.importo_pagato) || 0)) * 100) / 100,
    stato: s.stato,
    data_scadenza: s.data_scadenza,
    data_emissione: s.data_emissione,
    tipo: s.tipo,
    cantiere_nome: s.cantieri?.nome || null,
  }))
}

export async function saldaFatturaEsposizione(
  scadenzaId: string,
  contoId: string,
  dataPagamento: string
) {
  const supabase = await createClient()

  const { data: scadenza, error: errScad } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, fattura_riferimento, tipo')
    .eq('id', scadenzaId)
    .single()

  if (errScad || !scadenza) throw new Error('Fattura non trovata')

  const residuo = Number(scadenza.importo_totale) - Number(scadenza.importo_pagato || 0)

  const { error: errUpdate } = await supabase
    .from('scadenze_pagamento')
    .update({
      stato: 'pagato',
      importo_pagato: scadenza.importo_totale,
      data_pagamento: dataPagamento,
      metodo_pagamento: 'bonifico'
    })
    .eq('id', scadenzaId)

  if (errUpdate) throw new Error('Errore aggiornamento fattura')

  // Movimento bancario riconciliato (segno in base a tipo)
  const importoMovimento = scadenza.tipo === 'entrata' ? residuo : -residuo
  await supabase.from('movimenti_banca').insert({
    conto_banca_id: contoId,
    data_operazione: dataPagamento,
    importo: importoMovimento,
    descrizione: `Saldo ${scadenza.tipo === 'entrata' ? 'incasso' : 'pagamento'}: ${scadenza.fattura_riferimento || 'Fattura'}`,
    stato_riconciliazione: 'riconciliato',
    scadenza_id: scadenzaId
  })

  // Aggiorna saldo banca
  const { data: conto } = await supabase.from('conti_banca').select('saldo_attuale').eq('id', contoId).single()
  if (conto) {
    await supabase.from('conti_banca').update({
      saldo_attuale: Number(conto.saldo_attuale) + importoMovimento
    }).eq('id', contoId)
  }

  revalidatePath('/finanza')
  revalidatePath('/scadenze')
  return { success: true }
}

export async function riprogrammaScadenzaEsposizione(
  scadenzaId: string,
  nuovaData: string
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ data_scadenza: nuovaData, data_pianificata: nuovaData })
    .eq('id', scadenzaId)

  if (error) throw new Error('Errore riprogrammazione')

  revalidatePath('/finanza')
  revalidatePath('/finanza/programmazione')
  revalidatePath('/scadenze')
  return { success: true }
}

export async function assegnaCantiereEsposizione(
  scadenzaId: string,
  cantiereId: string
) {
  const supabase = await createClient()

  // Leggi fattura_riferimento e soggetto per propagare alle rate sorelle
  const { data: scadenza } = await supabase
    .from('scadenze_pagamento')
    .select('fattura_riferimento, soggetto_id')
    .eq('id', scadenzaId)
    .single()

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ cantiere_id: cantiereId || null })
    .eq('id', scadenzaId)

  if (error) throw new Error('Errore assegnazione cantiere')

  // Propaga alle rate sorelle (stessa fattura, stesso soggetto - incluse pagate)
  if (scadenza?.fattura_riferimento && scadenza?.soggetto_id) {
    await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: cantiereId || null })
      .eq('fattura_riferimento', scadenza.fattura_riferimento)
      .eq('soggetto_id', scadenza.soggetto_id)
      .neq('id', scadenzaId)
  }

  // Rimuovi allocazioni multi se presenti (passaggio a singolo)
  await supabase.from('scadenze_cantiere').delete().eq('scadenza_id', scadenzaId)

  revalidatePath('/finanza')
  revalidatePath('/scadenze')
  return { success: true }
}
