'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { parseCSVBanca, parseXMLBanca, importMovimentiBanca, confermaRiconciliazione } from '@/utils/data-fetcher'

// --- AZIONI PER DOCUMENTI GENERICI ---
export async function uploadDocumentoBanca(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get("file") as File
  const conto_id = formData.get("conto_id") as string
  const anno = parseInt(formData.get("anno") as string)

  if (!file || !conto_id) throw new Error("Dati mancanti")

  // 1. Upload su Storage
  const filePath = `conti/${conto_id}/documenti/${anno}/${Date.now()}_${file.name}`
  const { error: storageErr } = await supabase.storage.from('documenti_finanza').upload(filePath, file)
  if (storageErr) {
    console.error("❌ ERRORE STORAGE SUPABASE:", storageErr)
    throw new Error(`Errore caricamento file: ${storageErr.message}`)
  }

  // 2. Ottieni URL Pubblico
  const { data: { publicUrl } } = supabase.storage.from('documenti_finanza').getPublicUrl(filePath)

  // 3. Salva a Database
  await supabase.from('documenti_banca').insert({
    conto_banca_id: conto_id, anno, nome_file: file.name, url_documento: publicUrl
  })
  revalidatePath('/finanza/riconciliazione')
}

export async function getDocumentiBanca(conto_id: string, anno: number) {
  const supabase = await createClient()
  const { data } = await supabase.from('documenti_banca').select('*').eq('conto_banca_id', conto_id).eq('anno', anno).order('created_at', { ascending: false })
  return data || []
}

// --- AZIONI PER ESTRATTI CONTO ---
export async function uploadEstrattoConto(formData: FormData) {
  const supabase = await createClient()
  const file = formData.get("file") as File
  const conto_id = formData.get("conto_id") as string
  const anno = parseInt(formData.get("anno") as string)
  const mese = parseInt(formData.get("mese") as string)

  if (!file || !conto_id) throw new Error("Dati mancanti")

  const filePath = `conti/${conto_id}/estratti/${anno}/${mese}/${Date.now()}_${file.name}`
  const { error: storageErr } = await supabase.storage.from('documenti_finanza').upload(filePath, file)
  if (storageErr) {
    console.error("❌ ERRORE STORAGE SUPABASE:", storageErr)
    throw new Error(`Errore caricamento file: ${storageErr.message}`)
  }

  const { data: { publicUrl } } = supabase.storage.from('documenti_finanza').getPublicUrl(filePath)

  await supabase.from('estratti_conto').insert({
    conto_banca_id: conto_id, anno, mese, nome_file: file.name, url_documento: publicUrl
  })
  revalidatePath('/finanza/riconciliazione')
}

export async function getEstrattiConto(conto_id: string, anno: number, mese: number) {
  const supabase = await createClient()
  const { data } = await supabase.from('estratti_conto').select('*').eq('conto_banca_id', conto_id).eq('anno', anno).eq('mese', mese).order('created_at', { ascending: false })
  return data || []
}

export async function creaContoBanca(formData: FormData) {
  const nome_banca = formData.get("nome_banca") as string
  const nome_conto = formData.get("nome_conto") as string
  const iban = formData.get("iban") as string
  const saldo_iniziale = parseFloat((formData.get("saldo_iniziale") as string) || "0")

  if (!nome_banca || !nome_conto) {
    throw new Error("Nome banca e nome conto sono obbligatori")
  }

  const supabase = await createClient()
  
  const { error } = await supabase.from('conti_banca').insert({
    nome_banca,
    nome_conto,
    iban,
    saldo_iniziale,
    saldo_attuale: saldo_iniziale // All'inizio coincidono
  })

  if (error) {
    console.error("Errore creazione conto:", error)
    throw new Error("Impossibile creare il conto")
  }

  // Ricarica la dashboard per mostrare la nuova card
  revalidatePath('/finanza/riconciliazione')
}

export async function importaEstrattoConto(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const contoId = formData.get('contoId') as string;
    const anno = formData.get('anno') as string;
    const mese = formData.get('mese') as string;

    if (!file) throw new Error("Nessun file selezionato.");
    if (!contoId || !anno || !mese) throw new Error("Parametri del conto o data mancanti.");
    
    const text = await file.text();
    const fileName = file.name.toLowerCase();
    
    let movimenti: any[] = [];
    
    if (fileName.endsWith('.xml')) {
      movimenti = parseXMLBanca(text);
      console.log(`📦 XML: ${movimenti.length} movimenti estratti`);
    } else if (fileName.endsWith('.csv')) {
      movimenti = parseCSVBanca(text);
      console.log(`📦 CSV: ${movimenti.length} movimenti estratti`);
    } else {
      throw new Error("Formato non supportato. Usa file .csv o .xml");
    }
    
    if (movimenti.length === 0) {
      throw new Error("Nessun movimento valido trovato.");
    }
    
    // Assegniamo esplicitamente il conto_banca_id a ogni movimento prima di salvarlo
    const movimentiConConto = movimenti.map(m => ({
      ...m,
      conto_banca_id: contoId
    }));
    
    const inseriti = await importMovimentiBanca(movimentiConConto);

    // Salviamo la traccia dell'upload nell'archivio storico mensile
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    await supabaseAdmin
      .from('upload_banca')
      .insert({
        conto_banca_id: contoId,
        anno: Number(anno),
        mese: Number(mese),
        nome_file: fileName
      });
    
    revalidatePath('/finanza/riconciliazione');
    revalidatePath(`/finanza/riconciliazione/${contoId}`);
    return { success: true, conteggio: inseriti?.length || 0 };
  } catch (error: any) {
    console.error("❌ Errore importazione:", error);
    return { error: error.message };
  }
}

export async function handleConferma(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string | null;
    const soggetto_id = formData.get('soggetto_id') as string | null;
    const personale_id = formData.get('personale_id') as string | null;
    const categoria = formData.get('categoria') as string;
    const importo = Number(formData.get('importo'));

    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // ===============================================
    // CASO SPECIALE: Commissione, Giroconto, Stipendio
    // ===============================================
    if (['commissione', 'giroconto', 'stipendio', 'leasing', 'ente_pubblico', 'cassa_edile', 'cessione_quinto', 'utenza', 'assicurazione'].includes(categoria)) {
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          categoria_dedotta: categoria,
          personale_id: personale_id || null
        })
        .eq('id', movimento_id);
    } 
    // ===============================================
    // CASO A: Match Esatto Fattura
    // ===============================================
    else if (scadenza_id) {
      await confermaRiconciliazione(
        movimento_id, 
        scadenza_id, 
        importo, 
        'confermato_utente',
        soggetto_id || undefined
      );
    } 
    // ===============================================
    // CASO B: Allocazione Multipla / Acconto
    // ===============================================
    else if (soggetto_id) {
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          soggetto_id: soggetto_id,
          categoria_dedotta: categoria || 'fattura'
        })
        .eq('id', movimento_id);

      await allocaPagamentoIntelligente(supabaseAdmin, soggetto_id, importo);
      
    } else {
      throw new Error("Dati insufficienti per confermare (manca scadenza, soggetto o categoria valida).");
    }

    revalidatePath('/finanza/riconciliazione');
    revalidatePath('/finanza');
    revalidatePath('/scadenze');
    revalidatePath('/anagrafiche'); 
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore conferma match:", error);
    return { error: error.message };
  }
}

export async function handleRifiuta(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    const { error } = await supabaseAdmin
      .from('movimenti_banca')
      .update({ 
        ai_suggerimento: null, 
        soggetto_id: null, 
        personale_id: null,
        categoria_dedotta: null, 
        ai_confidence: 0, 
        ai_motivo: 'Selezione manuale richiesta' 
      })
      .eq('id', movimento_id);

    if (error) throw error;

    revalidatePath('/finanza/riconciliazione');
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore rifiuto match:", error);
    return { error: error.message };
  }
}

export async function matchManuale(formData: FormData) {
  return handleConferma(formData);
}

// ============================================================================
// MOTORE DI ALLOCAZIONE INTELLIGENTE (Subset Sum Sicuro + FIFO)
// ============================================================================

async function allocaPagamentoIntelligente(supabaseAdmin: any, soggetto_id: string, importo_pagato: number) {
  const { data: scadenzeAperte } = await supabaseAdmin
    .from('scadenze_pagamento')
    .select('id, importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id)
    .neq('stato', 'pagato')
    .order('data_scadenza', { ascending: true });

  if (!scadenzeAperte || scadenzeAperte.length === 0) return;

  const targetCents = Math.round(importo_pagato * 100);
  const items = scadenzeAperte.map((s: any) => ({
    ...s,
    residuoCents: Math.round((Number(s.importo_totale) - Number(s.importo_pagato || 0)) * 100)
  }));

  let combinazioneEsatta = null;

  if (items.length <= 20) {
    function trovaCombinazioneEsatta(index: number, sum: number, subset: any[]): any[] | null {
      if (sum === targetCents) return subset;
      if (sum > targetCents || index >= items.length) return null;
      
      const include = trovaCombinazioneEsatta(index + 1, sum + items[index].residuoCents, [...subset, items[index]]);
      if (include) return include;
      
      return trovaCombinazioneEsatta(index + 1, sum, subset);
    }
    combinazioneEsatta = trovaCombinazioneEsatta(0, 0, []);
  } else {
    console.log(`⚠️ Troppe fatture (${items.length}), fallback su FIFO per evitare Timeout.`);
  }

  if (combinazioneEsatta) {
    for (const scadenza of combinazioneEsatta) {
      await supabaseAdmin
        .from('scadenze_pagamento')
        .update({ importo_pagato: scadenza.importo_totale, stato: 'pagato' })
        .eq('id', scadenza.id);
    }
    return;
  }

  let budgetResiduoCents = targetCents;

  for (const scadenza of items) {
    if (budgetResiduoCents <= 0) break;

    const daPagareCents = Math.min(scadenza.residuoCents, budgetResiduoCents);
    budgetResiduoCents -= daPagareCents;

    const vecchioPagatoEuro = Number(scadenza.importo_pagato || 0);
    const nuovoPagatoEuro = vecchioPagatoEuro + (daPagareCents / 100);
    
    const nuovoStato = (nuovoPagatoEuro >= Number(scadenza.importo_totale) - 0.01) ? 'pagato' : 'parziale';

    await supabaseAdmin
      .from('scadenze_pagamento')
      .update({ importo_pagato: nuovoPagatoEuro, stato: nuovoStato })
      .eq('id', scadenza.id);
  }
}