'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// ─── Types per DDT Grouping ──────────────────────────────────────

export interface RigaDDT {
  numero_linea: number
  descrizione: string
  quantita: number
  prezzo_totale: number
}

export interface GruppoDDT {
  ddt_riferimento: string | null
  righe: RigaDDT[]
  totale_netto: number
  cantiere_suggerito?: { id: string; nome: string; codice: string } | null
}

export interface RigheScadenzaResult {
  gruppi_ddt: GruppoDDT[]
  imponibile_fattura: number
  importo_lordo_fattura: number
  fattura_fornitore_id: string | null
  n_scadenze_sorelle: number
  gia_allocata: boolean
  allocazioni_esistenti: { ddt_riferimento: string | null; cantiere_id: string; cantiere_nome: string; importo: number }[]
  delta_no_ddt: number
}

/**
 * 1. Crea una nuova scadenza manuale (Entrata o Uscita)
 */
export async function creaScadenza(formData: FormData) {
  const supabase = await createClient()

  const rawFormData = {
    tipo: formData.get('tipo') as string, // 'entrata' | 'uscita'
    soggetto_id: formData.get('soggetto_id') as string || null,
    cantiere_id: formData.get('cantiere_id') as string || null,
    fattura_riferimento: formData.get('fattura_riferimento') as string || null,
    descrizione: formData.get('descrizione') as string || null,
    importo_totale: parseFloat(formData.get('importo_totale') as string) || 0,
    importo_pagato: 0,
    data_emissione: formData.get('data_emissione') as string || null,
    data_scadenza: formData.get('data_scadenza') as string,
    metodo_pagamento: formData.get('metodo_pagamento') as string || null,
    stato: 'da_pagare'
  }

  const { error } = await supabase
    .from('scadenze_pagamento')
    .insert([rawFormData])

  if (error) {
    console.error("❌ Errore creaScadenza:", error)
    redirect(`/scadenze?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scadenze')
  revalidatePath('/finanza')
  redirect('/scadenze?success=Scadenza+creata+con+successo')
}

/**
 * 2. Registra un pagamento su una scadenza esistente
 * Gestisce automaticamente il passaggio a 'parziale' o 'pagato'
 */
export async function segnaComePagato(formData: FormData) {
  const supabase = await createClient()
  
  const id = formData.get('scadenza_id') as string
  const importoPagamento = parseFloat(formData.get('importo_pagamento') as string) || 0
  const dataPagamento = formData.get('data_pagamento') as string || new Date().toISOString().split('T')[0]
  const metodoPagamento = formData.get('metodo_pagamento') as string || null

  // Recuperiamo i dati attuali della scadenza
  const { data: scadenza, error: fetchError } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato')
    .eq('id', id)
    .single()

  if (fetchError || !scadenza) {
    console.error("❌ Errore recupero scadenza:", fetchError)
    redirect(`/scadenze?error=Scadenza non trovata`)
  }

  const nuovoImportoPagato = (scadenza.importo_pagato || 0) + importoPagamento
  
  // Logica Stato
  let nuovoStato = 'parziale'
  if (nuovoImportoPagato >= scadenza.importo_totale) {
    nuovoStato = 'pagato'
  }

  const { error: updateError } = await supabase
    .from('scadenze_pagamento')
    .update({
      importo_pagato: nuovoImportoPagato,
      stato: nuovoStato,
      data_pagamento: nuovoStato === 'pagato' ? dataPagamento : null,
      metodo_pagamento: metodoPagamento
    })
    .eq('id', id)

  if (updateError) {
    console.error("❌ Errore aggiornamento pagamento:", updateError)
    redirect(`/scadenze?error=${encodeURIComponent(updateError.message)}`)
  }

  revalidatePath('/scadenze')
  revalidatePath('/finanza')
  redirect('/scadenze?success=Pagamento+registrato')
}

/**
 * 3. Aggiorna lo stato delle scadenze superate (chiamata solitamente dal Cron)
 */
export async function aggiornaStatoScadute() {
  const supabase = await createClient()

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ stato: 'scaduto' })
    .lt('data_scadenza', new Date().toISOString().split('T')[0])
    .in('stato', ['da_pagare', 'parziale'])

  if (error) {
    console.error("❌ Errore aggiornamento scadenze scadute:", error)
    return { success: false, error: error.message }
  }

  revalidatePath('/scadenze')
  return { success: true }
}

/**
 * 4. Assegnazione Cantiere Semplice (Legacy)
 */
export async function assegnaCantiereAScadenza(scadenzaId: string, cantiereId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("scadenze_pagamento")
    .update({ cantiere_id: cantiereId === "null" ? null : cantiereId })
    .eq("id", scadenzaId);

  if (error) {
    console.error("❌ Errore assegnazione cantiere:", error);
    return { error: error.message };
  }
  
  revalidatePath('/scadenze');
  revalidatePath('/finanza'); 
  return { success: true };
}

/**
 * 5. Salva l'assegnazione del cantiere (Singolo o Multiplo - NUOVO)
 */
export async function salvaAssegnazioneCantiere(
  scadenzaId: string, 
  data: { mode: 'singolo', cantiere_id: string } | { mode: 'multiplo', allocazioni: { cantiere_id: string, importo: number }[] }
) {
  const supabase = await createClient()

  if (data.mode === 'singolo') {
    const { error: errUpdate } = await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: data.cantiere_id || null })
      .eq('id', scadenzaId)

    if (errUpdate) throw new Error("Errore aggiornamento cantiere")

    const { error: errDelete } = await supabase
      .from('scadenze_cantiere')
      .delete()
      .eq('scadenza_id', scadenzaId)

    if (errDelete) throw new Error("Errore rimozione vecchie allocazioni")

  } else {
    const { error: errUpdate } = await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: null })
      .eq('id', scadenzaId)

    if (errUpdate) throw new Error("Errore reset cantiere")

    const { error: errDelete } = await supabase
      .from('scadenze_cantiere')
      .delete()
      .eq('scadenza_id', scadenzaId)

    if (errDelete) throw new Error("Errore rimozione vecchie allocazioni")

    const righeToInsert = data.allocazioni
      .filter(a => a.cantiere_id && a.importo > 0)
      .map(a => ({
        scadenza_id: scadenzaId,
        cantiere_id: a.cantiere_id,
        importo: a.importo
      }))

    if (righeToInsert.length > 0) {
      const { error: errInsert } = await supabase
        .from('scadenze_cantiere')
        .insert(righeToInsert)

      if (errInsert) throw new Error("Errore inserimento nuove allocazioni: " + errInsert.message)
    }
  }

  revalidatePath('/scadenze')
  revalidatePath('/scadenze/da-smistare')
}

/**
 * 6. Assegna massivamente un cantiere a più scadenze ("Da Smistare")
 */
export async function assegnaCantiereBulk(scadenzaIds: string[], cantiereId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ cantiere_id: cantiereId || null })
    .in('id', scadenzaIds)

  if (error) {
    console.error("Errore assegnaCantiereBulk:", error)
    throw new Error("Impossibile assegnare il cantiere in modo massivo.")
  }

  const { error: errDelete } = await supabase
    .from('scadenze_cantiere')
    .delete()
    .in('scadenza_id', scadenzaIds)

  if (errDelete) {
    console.error("Errore pulizia scadenze_cantiere bulk:", errDelete)
  }

  revalidatePath('/scadenze')
  revalidatePath('/scadenze/da-smistare')
}

/**
 * 7. Invia sollecito WhatsApp (Placeholder per Fase 3)
 */
export async function inviaReminderWhatsApp(scadenzaId: string) {
  console.log("Invia reminder per scadenza", scadenzaId)
}

export async function registraIncassoFattura(scadenzaId: string, contoId: string, dataPagamento: string, metodoPagamento: string) {
  const supabase = await createClient();

  // 1. Recupera i dati della fattura
  const { data: scadenza, error: errScad } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, fattura_riferimento')
    .eq('id', scadenzaId)
    .single();

  if (errScad || !scadenza) throw new Error('Fattura non trovata');

  const daIncassare = Number(scadenza.importo_totale) - Number(scadenza.importo_pagato || 0);

  // 2. Chiudi la fattura
  const { error: errUpdate } = await supabase.from('scadenze_pagamento').update({
    stato: 'pagato',
    importo_pagato: scadenza.importo_totale,
    data_pagamento: dataPagamento,
    metodo_pagamento: metodoPagamento
  }).eq('id', scadenzaId);

  if (errUpdate) throw new Error('Errore aggiornamento fattura');

  // 3. Crea il movimento bancario manuale GIA' RICONCILIATO
  await supabase.from('movimenti_banca').insert({
    conto_banca_id: contoId,
    data_operazione: dataPagamento,
    importo: daIncassare, // Entrata positiva
    descrizione: `Incasso manuale: ${scadenza.fattura_riferimento || 'Fattura Vendita'}`,
    stato_riconciliazione: 'riconciliato',
    scadenza_id: scadenzaId
  });

  // 4. Aumenta il saldo della banca (Il Data Zero viene rispettato)
  const { data: conto } = await supabase.from('conti_banca').select('saldo_attuale').eq('id', contoId).single();
  if (conto) {
    await supabase.from('conti_banca').update({
      saldo_attuale: Number(conto.saldo_attuale) + daIncassare
    }).eq('id', contoId);
  }

  // Aggiorna la vista
  revalidatePath('/scadenze');
  revalidatePath('/finanza');
  
  return { success: true };
}

export async function riprogrammaScadenza(scadenzaId: string, nuovaData: string, importoPianificato?: number | null) {
  const supabase = await createClient();

  const updateData: Record<string, any> = { data_pianificata: nuovaData };

  // Se importoPianificato è specificato, salvalo (null = intero residuo)
  if (importoPianificato !== undefined) {
    updateData.importo_pianificato = importoPianificato;
  }

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update(updateData)
    .eq('id', scadenzaId);

  if (error) {
    console.error('❌ Errore riprogrammaScadenza:', error);
    throw new Error('Errore durante la riprogrammazione');
  }

  revalidatePath('/scadenze');
  revalidatePath('/finanza');
  revalidatePath('/finanza/programmazione');

  return { success: true };
}

/**
 * 9. Aggiorna il riferimento fattura di una scadenza
 */
export async function aggiornaFatturaRiferimento(scadenzaId: string, valore: string | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ fattura_riferimento: valore })
    .eq('id', scadenzaId);

  if (error) {
    console.error('❌ Errore aggiornaFatturaRiferimento:', error);
    throw new Error('Errore aggiornamento fattura');
  }

  revalidatePath('/scadenze');
  revalidatePath('/scadenze/da-smistare');

  return { success: true };
}

/**
 * 10. Aggiorna l'aliquota IVA di una scadenza (per scorporo IVA nei costi cantiere)
 */
export async function aggiornaAliquotaIva(scadenzaId: string, aliquotaIva: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scadenze_pagamento')
    .update({ aliquota_iva: aliquotaIva })
    .eq('id', scadenzaId);

  if (error) {
    console.error('Errore aggiornaAliquotaIva:', error);
    throw new Error('Errore aggiornamento aliquota IVA');
  }

  revalidatePath('/scadenze');
  revalidatePath('/finanza');
  revalidatePath('/cantieri');

  return { success: true };
}

/**
 * 11. Recupera righe dettaglio raggruppate per DDT di una scadenza.
 * Usato dal modale AssegnaCantiereModal in modalita "Per DDT".
 */
export async function getRighePerScadenza(scadenzaId: string): Promise<RigheScadenzaResult> {
  const supabase = await createClient()

  // 1. Leggi scadenza
  const { data: scadenza, error: errScad } = await supabase
    .from('scadenze_pagamento')
    .select('id, fattura_riferimento, fattura_fornitore_id, soggetto_id, data_emissione, importo_totale')
    .eq('id', scadenzaId)
    .single()

  if (errScad || !scadenza) {
    return {
      gruppi_ddt: [], imponibile_fattura: 0, importo_lordo_fattura: 0,
      fattura_fornitore_id: null, n_scadenze_sorelle: 0,
      gia_allocata: false, allocazioni_esistenti: [], delta_no_ddt: 0
    }
  }

  // 2. Trova fattura_fornitore_id (FK diretta o fallback testuale)
  let fatturaId = scadenza.fattura_fornitore_id as string | null

  if (!fatturaId && scadenza.fattura_riferimento && scadenza.soggetto_id) {
    const { data: fatture } = await supabase
      .from('fatture_fornitori')
      .select('id')
      .eq('numero_fattura', scadenza.fattura_riferimento)
      .eq('soggetto_id', scadenza.soggetto_id)
      .eq('data_fattura', scadenza.data_emissione)
      .limit(1)

    if (fatture && fatture.length > 0) {
      fatturaId = fatture[0].id
    }
  }

  if (!fatturaId) {
    return {
      gruppi_ddt: [], imponibile_fattura: 0,
      importo_lordo_fattura: scadenza.importo_totale || 0,
      fattura_fornitore_id: null, n_scadenze_sorelle: 0,
      gia_allocata: false, allocazioni_esistenti: [], delta_no_ddt: 0
    }
  }

  // 3. Leggi fattura per importo lordo e imponibile
  const { data: fattura } = await supabase
    .from('fatture_fornitori')
    .select('id, importo_totale, importo_imponibile')
    .eq('id', fatturaId)
    .single()

  // 4. Leggi righe dettaglio
  const { data: righe } = await supabase
    .from('fatture_dettaglio_righe')
    .select('numero_linea, descrizione, quantita, prezzo_totale, ddt_riferimento')
    .eq('fattura_id', fatturaId)
    .order('numero_linea')

  const righeArr = righe || []
  const importoLordo = fattura?.importo_totale || scadenza.importo_totale || 0
  const sommaRighe = righeArr.reduce((acc, r) => acc + (r.prezzo_totale || 0), 0)
  const imponibile = fattura?.importo_imponibile || sommaRighe || 0

  // 5. Raggruppa per ddt_riferimento
  const gruppiMap = new Map<string | null, RigaDDT[]>()
  for (const r of righeArr) {
    const key = r.ddt_riferimento || null
    if (!gruppiMap.has(key)) gruppiMap.set(key, [])
    gruppiMap.get(key)!.push({
      numero_linea: r.numero_linea,
      descrizione: r.descrizione || '',
      quantita: r.quantita || 0,
      prezzo_totale: r.prezzo_totale || 0
    })
  }

  // 6. Conta scadenze sorelle (stessa fattura)
  let nSorelle = 0
  const { count } = await supabase
    .from('scadenze_pagamento')
    .select('id', { count: 'exact', head: true })
    .eq('fattura_fornitore_id', fatturaId)

  nSorelle = (count || 1)

  // Se non ha FK, fallback su testo
  if (!count || count === 0) {
    const { count: countText } = await supabase
      .from('scadenze_pagamento')
      .select('id', { count: 'exact', head: true })
      .eq('fattura_riferimento', scadenza.fattura_riferimento)
      .eq('soggetto_id', scadenza.soggetto_id)
      .eq('data_emissione', scadenza.data_emissione)

    nSorelle = countText || 1
  }

  // 7. Verifica allocazioni esistenti (da qualsiasi scadenza sorella)
  const { data: scadenzeSorelle } = await supabase
    .from('scadenze_pagamento')
    .select('id')
    .eq('fattura_fornitore_id', fatturaId)

  const sorellaIds = (scadenzeSorelle || []).map(s => s.id)
  let allocazioniEsistenti: RigheScadenzaResult['allocazioni_esistenti'] = []
  let giaAllocata = false

  if (sorellaIds.length > 0) {
    const { data: alloc } = await supabase
      .from('scadenze_cantiere')
      .select('ddt_riferimento, cantiere_id, importo, scadenza_id, cantieri(titolo)')
      .in('scadenza_id', sorellaIds)

    if (alloc && alloc.length > 0) {
      // Allocazioni fatte da scadenze sorelle (non questa)
      const daAltre = alloc.filter(a => a.scadenza_id !== scadenzaId)
      giaAllocata = daAltre.length > 0 && alloc.some(a => a.ddt_riferimento)

      allocazioniEsistenti = alloc.map(a => ({
        ddt_riferimento: a.ddt_riferimento,
        cantiere_id: a.cantiere_id,
        cantiere_nome: (a.cantieri as any)?.titolo || '',
        importo: a.importo || 0
      }))
    }
  }

  // 8. Suggerimenti cantiere per DDT (storico stesso fornitore)
  const gruppiDdt: GruppoDDT[] = []
  const ddtRefs = Array.from(gruppiMap.keys()).filter(k => k !== null) as string[]

  let suggerimentiStorico = new Map<string, { id: string; nome: string; codice: string }>()
  if (ddtRefs.length > 0 && scadenza.soggetto_id) {
    const { data: storicoAlloc } = await supabase
      .from('scadenze_cantiere')
      .select('ddt_riferimento, cantiere_id, scadenza_id, cantieri(titolo, codice)')
      .in('ddt_riferimento', ddtRefs)
      .not('cantiere_id', 'is', null)

    if (storicoAlloc) {
      for (const sa of storicoAlloc) {
        if (sa.ddt_riferimento && sa.cantiere_id && !suggerimentiStorico.has(sa.ddt_riferimento)) {
          const cantInfo = sa.cantieri as any
          suggerimentiStorico.set(sa.ddt_riferimento, {
            id: sa.cantiere_id,
            nome: cantInfo?.titolo || '',
            codice: cantInfo?.codice || ''
          })
        }
      }
    }
  }

  // 9. Costruisci gruppi ordinati (DDT con valore prima, null alla fine)
  const keysOrdinati = Array.from(gruppiMap.keys()).sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  let totaleCopertoConDdt = 0
  for (const key of keysOrdinati) {
    const righeGruppo = gruppiMap.get(key)!
    const totale = righeGruppo.reduce((acc, r) => acc + r.prezzo_totale, 0)
    if (key !== null) totaleCopertoConDdt += totale

    gruppiDdt.push({
      ddt_riferimento: key,
      righe: righeGruppo,
      totale_netto: Math.round(totale * 100) / 100,
      cantiere_suggerito: key ? (suggerimentiStorico.get(key) || null) : null
    })
  }

  return {
    gruppi_ddt: gruppiDdt,
    imponibile_fattura: Math.round(imponibile * 100) / 100,
    importo_lordo_fattura: Math.round(importoLordo * 100) / 100,
    fattura_fornitore_id: fatturaId,
    n_scadenze_sorelle: nSorelle,
    gia_allocata: giaAllocata,
    allocazioni_esistenti: allocazioniEsistenti,
    delta_no_ddt: Math.round((imponibile - totaleCopertoConDdt) * 100) / 100
  }
}


/**
 * 12. Salva allocazione DDT → Cantiere.
 * Distribuisce pro-quota lordo su tutte le scadenze sorelle.
 * Regola quadratura: lo scarto arrotondamento va sull'allocazione maggiore.
 */
export async function salvaAssegnazioneDDT(payload: {
  scadenza_id: string
  fattura_fornitore_id: string
  allocazioni: { ddt_riferimento: string | null; cantiere_id: string; importo_netto: number }[]
}) {
  const supabase = await createClient()

  const { scadenza_id, fattura_fornitore_id, allocazioni } = payload

  if (!allocazioni || allocazioni.length === 0) {
    throw new Error('Nessuna allocazione fornita')
  }

  // 1. Trova tutte le scadenze sorelle
  const { data: sorelle } = await supabase
    .from('scadenze_pagamento')
    .select('id, importo_totale')
    .eq('fattura_fornitore_id', fattura_fornitore_id)

  // Fallback: se nessuna sorella trovata via FK, usa solo la scadenza corrente
  let scadenzeDaAllocare = sorelle || []
  if (scadenzeDaAllocare.length === 0) {
    const { data: singola } = await supabase
      .from('scadenze_pagamento')
      .select('id, importo_totale')
      .eq('id', scadenza_id)

    scadenzeDaAllocare = singola || []
  }

  if (scadenzeDaAllocare.length === 0) {
    throw new Error('Scadenza non trovata')
  }

  // 2. Cancella vecchie allocazioni di TUTTE le sorelle
  const tuttiIds = scadenzeDaAllocare.map(s => s.id)
  await supabase
    .from('scadenze_cantiere')
    .delete()
    .in('scadenza_id', tuttiIds)

  // 3. Calcola peso percentuale di ogni cantiere sull'imponibile
  const imponibileTotale = allocazioni.reduce((acc, a) => acc + a.importo_netto, 0)
  if (imponibileTotale <= 0) {
    throw new Error('Imponibile totale allocazioni deve essere positivo')
  }

  const pesi = allocazioni.map(a => ({
    ...a,
    peso: a.importo_netto / imponibileTotale
  }))

  // 4. Per ogni scadenza sorella, distribuisci pro-quota lordo
  const righeToInsert: { scadenza_id: string; cantiere_id: string; importo: number; ddt_riferimento: string | null }[] = []

  for (const scadenza of scadenzeDaAllocare) {
    const importoLordo = scadenza.importo_totale || 0

    // Calcola importi arrotondati
    const importiRaw = pesi.map(p => ({
      cantiere_id: p.cantiere_id,
      ddt_riferimento: p.ddt_riferimento,
      importo: Math.round(importoLordo * p.peso * 100) / 100
    }))

    // Quadratura arrotondamenti: forza lo scarto sull'allocazione maggiore
    const sommaArrotondata = importiRaw.reduce((acc, i) => acc + i.importo, 0)
    const scarto = Math.round((importoLordo - sommaArrotondata) * 100) / 100

    if (scarto !== 0 && importiRaw.length > 0) {
      let idxMax = 0
      for (let i = 1; i < importiRaw.length; i++) {
        if (importiRaw[i].importo > importiRaw[idxMax].importo) idxMax = i
      }
      importiRaw[idxMax].importo = Math.round((importiRaw[idxMax].importo + scarto) * 100) / 100
    }

    for (const alloc of importiRaw) {
      if (alloc.importo > 0 && alloc.cantiere_id) {
        righeToInsert.push({
          scadenza_id: scadenza.id,
          cantiere_id: alloc.cantiere_id,
          importo: alloc.importo,
          ddt_riferimento: alloc.ddt_riferimento
        })
      }
    }
  }

  // 5. Inserisci tutte le allocazioni
  if (righeToInsert.length > 0) {
    const { error: errInsert } = await supabase
      .from('scadenze_cantiere')
      .insert(righeToInsert)

    if (errInsert) throw new Error('Errore inserimento allocazioni DDT: ' + errInsert.message)
  }

  // 6. Se tutte le allocazioni vanno allo stesso cantiere, aggiorna cantiere_id su scadenze_pagamento
  const cantieriUnici = new Set(allocazioni.map(a => a.cantiere_id).filter(Boolean))
  if (cantieriUnici.size === 1) {
    const cantiereUnico = Array.from(cantieriUnici)[0]
    await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: cantiereUnico })
      .in('id', tuttiIds)
  } else {
    // Multiplo: resetta cantiere_id (allocazione dettagliata in scadenze_cantiere)
    await supabase
      .from('scadenze_pagamento')
      .update({ cantiere_id: null })
      .in('id', tuttiIds)
  }

  revalidatePath('/scadenze')
  revalidatePath('/scadenze/da-smistare')
  revalidatePath('/finanza')
  revalidatePath('/cantieri')
}