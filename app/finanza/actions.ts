'use server'

import { createClient } from '@/utils/supabase/server'

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
