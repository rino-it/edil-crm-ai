'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { parseCSVBanca, parseXMLBanca, importMovimentiBanca, confermaRiconciliazione } from '@/utils/data-fetcher'

// ==========================================
// AZIONI PER DOCUMENTI GENERICI (NUVOLA)
// ==========================================
export async function uploadDocumentoBanca(formData: FormData) {
  const supabase = await createClient()
  
  // Usiamo getAll("files") per estrarre l'array di tutti i documenti caricati
  const files = formData.getAll("files") as File[]
  const conto_id = formData.get("conto_id") as string
  const anno = parseInt(formData.get("anno") as string)

  if (!files || files.length === 0 || !conto_id) throw new Error("Dati mancanti")

  // Cicliamo su ogni file eseguendo l'upload su Storage e il salvataggio in DB
  for (const file of files) {
    if (file.size === 0) continue; // Ignoriamo i file fantasma generati a volte dal browser

    const filePath = `conti/${conto_id}/documenti/${anno}/${Date.now()}_${file.name}`
    const { error: storageErr } = await supabase.storage.from('documenti_finanza').upload(filePath, file)
    
    if (storageErr) {
      console.error(`❌ ERRORE STORAGE SU ${file.name}:`, storageErr)
      throw new Error(`Errore caricamento file ${file.name}: ${storageErr.message}`)
    }

    const { data: { publicUrl } } = supabase.storage.from('documenti_finanza').getPublicUrl(filePath)

    await supabase.from('documenti_banca').insert({
      conto_banca_id: conto_id, anno, nome_file: file.name, url_documento: publicUrl
    })
  }
  
  revalidatePath('/finanza/riconciliazione')
}

export async function getDocumentiBanca(conto_id: string, anno: number) {
  const supabase = await createClient()
  const { data } = await supabase.from('documenti_banca').select('*').eq('conto_banca_id', conto_id).eq('anno', anno).order('created_at', { ascending: false })
  return data || []
}

export async function rinominaDocumentoBanca(id: string, nuovoNome: string) {
  const supabase = await createClient()
  
  let nomeFinale = nuovoNome
  const { data: doc } = await supabase.from('documenti_banca').select('nome_file').eq('id', id).single()
  
  if (doc) {
    const extMatch = doc.nome_file.match(/\.[0-9a-z]+$/i)
    const originalExt = extMatch ? extMatch[0] : ''
    if (originalExt && !nomeFinale.endsWith(originalExt)) {
      nomeFinale += originalExt
    }
  }

  const { error } = await supabase.from('documenti_banca').update({ nome_file: nomeFinale }).eq('id', id)
  if (error) throw new Error("Impossibile rinominare il documento")
  
  revalidatePath('/finanza/riconciliazione')
  return true
}

// ==========================================
// AZIONI PER ESTRATTI CONTO (CALENDARIO)
// ==========================================
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

// ==========================================
// GESTIONE CONTI E CARTE
// ==========================================
export async function creaContoBanca(formData: FormData) {
  const nome_banca = formData.get("nome_banca") as string
  const nome_conto = formData.get("nome_conto") as string
  const iban = formData.get("iban") as string
  const tipo_conto = formData.get("tipo_conto") as string || "conto"
  const saldo_iniziale = parseFloat((formData.get("saldo_iniziale") as string) || "0")
  const plafond = parseFloat((formData.get("plafond") as string) || "0")
  const giorno_addebito = formData.get("giorno_addebito") ? parseInt(formData.get("giorno_addebito") as string) : null

  if (!nome_banca || !nome_conto) {
    throw new Error("Nome banca e nome conto sono obbligatori")
  }

  const supabase = await createClient()
  
  const { error } = await supabase.from('conti_banca').insert({
    nome_banca,
    nome_conto,
    iban,
    tipo_conto,
    plafond: tipo_conto === 'credito' ? plafond : null,
    giorno_addebito: tipo_conto === 'credito' ? giorno_addebito : null,
    saldo_iniziale: tipo_conto === 'credito' ? 0 : saldo_iniziale,
    saldo_attuale: tipo_conto === 'credito' ? 0 : saldo_iniziale
  })

  if (error) {
    console.error("Errore creazione conto:", error)
    throw new Error("Impossibile creare il conto")
  }

  revalidatePath('/finanza/riconciliazione')
}

// ==========================================
// IMPORTAZIONE MOVIMENTI
// ==========================================
export async function importaEstrattoConto(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const contoId = formData.get('contoId') as string;
    const anno = formData.get('anno') as string;
    const mese = formData.get('mese') as string;

    if (!file) throw new Error("Nessun file selezionato.");
    if (!contoId || !anno || !mese) throw new Error("Parametri del conto o data mancanti.");
    
    const fileName = file.name.toLowerCase();
    
    // ----------------------------------------------------
    // 1. GESTIONE PDF (Solo Archiviazione in Cloud)
    // ----------------------------------------------------
    if (fileName.endsWith('.pdf')) {
      const supabase = await createClient(); 
      const filePath = `conti/${contoId}/estratti/${anno}/${mese}/${Date.now()}_${file.name}`;
      const { error: storageErr } = await supabase.storage.from('documenti_finanza').upload(filePath, file);
      
      if (storageErr) throw new Error(`Errore storage: ${storageErr.message}`);
      
      const { data: { publicUrl } } = supabase.storage.from('documenti_finanza').getPublicUrl(filePath);

      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      await supabaseAdmin.from('upload_banca').insert({
        conto_banca_id: contoId,
        anno: Number(anno),
        mese: Number(mese),
        nome_file: file.name,
        url_storage: publicUrl,
        tipo: 'pdf_estratto'
      });
        
      revalidatePath('/finanza/riconciliazione');
      return { success: true, conteggio: 0, message: "PDF archiviato con successo" };
    }

    // ----------------------------------------------------
    // 2. GESTIONE XML / CSV (Logica Preesistente)
    // ----------------------------------------------------
    const text = await file.text();
    let movimenti: any[] = [];
    if (fileName.endsWith('.xml')) {
      movimenti = parseXMLBanca(text);
    } else if (fileName.endsWith('.csv')) {
      movimenti = parseCSVBanca(text);
    } else {
      throw new Error("Formato non supportato. Usa file .pdf, .csv o .xml");
    }
    
    if (movimenti.length === 0) {
      throw new Error("Nessun movimento valido trovato.");
    }
    
    const movimentiConConto = movimenti.map(m => ({
      ...m,
      conto_banca_id: contoId
    }));
    
    const inseriti = await importMovimentiBanca(movimentiConConto, contoId);

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
        nome_file: file.name,
        tipo: fileName.endsWith('.xml') ? 'xml' : 'csv'
      });
    
    revalidatePath('/finanza/riconciliazione');
    revalidatePath(`/finanza/riconciliazione/${contoId}`);
    return { success: true, conteggio: inseriti?.length || 0 };
  } catch (error: any) {
    console.error("❌ Errore importazione:", error);
    return { error: error.message };
  }
}

// ==========================================
// RICONCILIAZIONE (MATCHING)
// ==========================================
export async function handleConferma(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string | null;
    const soggetto_id = formData.get('soggetto_id') as string | null;
    const personale_id = formData.get('personale_id') as string | null;
    const categoria = formData.get('categoria') as string;
    const importo = Number(formData.get('importo'));
    const note_riconciliazione = (formData.get('note_riconciliazione') as string | null) || null;

    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Recupera il movimento per avere conto_banca_id (necessario per aggiornare il saldo)
    // Nota: il saldo viene già aggiornato all'import CSV; qui aggiorniamo solo lo stato riconciliazione.
    // Per categorie speciali (commissione, stipendio, ecc.) il movimento è già nel saldo — nessun doppio conteggio.

    // Fallback: se non c'è scadenza_id né soggetto_id ma c'è manual_filter, cerca in anagrafica_soggetti
    const manual_filter = (formData.get('manual_filter') as string || '').trim();
    let resolvedSoggettoId = soggetto_id;

    if (!['commissione', 'giroconto', 'carta_credito', 'stipendio', 'leasing', 'ente_pubblico', 'cassa_edile', 'cessione_quinto', 'utenza', 'assicurazione', 'f24', 'finanziamento_socio', 'interessi_bancari', 'mutuo'].includes(categoria)
        && !scadenza_id && !soggetto_id && manual_filter && manual_filter.length >= 3) {
      const { data: soggetti, error: searchErr } = await supabaseAdmin
        .from('anagrafica_soggetti')
        .select('id, ragione_sociale')
        .ilike('ragione_sociale', `%${manual_filter}%`);

      if (searchErr) {
        return { error: `Errore ricerca fornitore: ${searchErr.message}` };
      }

      if (!soggetti || soggetti.length === 0) {
        return { error: 'fornitore_non_trovato', nome: manual_filter };
      }

      if (soggetti.length > 1) {
        return { error: `Più fornitori corrispondono a "${manual_filter}", seleziona dal dropdown` };
      }

      resolvedSoggettoId = soggetti[0].id;
    }

    if (['commissione', 'giroconto', 'carta_credito', 'stipendio', 'leasing', 'ente_pubblico', 'cassa_edile', 'cessione_quinto', 'utenza', 'assicurazione', 'f24', 'finanziamento_socio', 'interessi_bancari', 'mutuo'].includes(categoria)) {
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          categoria_dedotta: categoria,
          personale_id: personale_id || null,
          ...(note_riconciliazione ? { note_riconciliazione } : {})
        })
        .eq('id', movimento_id);

      // Per giroconti/carte: tenta di identificare e salvare il conto destinazione
      if (categoria === 'giroconto' || categoria === 'carta_credito') {
        const { data: mov } = await supabaseAdmin
          .from('movimenti_banca')
          .select('descrizione, ai_motivo, conto_banca_id')
          .eq('id', movimento_id)
          .single();

        if (mov) {
          const testo = `${mov.descrizione || ''} ${mov.ai_motivo || ''}`.toLowerCase();
          const { data: conti } = await supabaseAdmin
            .from('conti_banca')
            .select('id, nome_conto, nome_banca, iban')
            .neq('id', mov.conto_banca_id);

          if (conti) {
            let contoDestId: string | null = null;
            for (const c of conti) {
              const digits = c.nome_conto?.match(/\*?(\d{3,4})/)?.[1];
              const ibanSuffix = c.iban?.slice(-4);
              const nomeContoLower = (c.nome_conto || '').toLowerCase();
              const nomeBancaLower = (c.nome_banca || '').toLowerCase();
              if (
                (digits && testo.includes(digits)) ||
                (ibanSuffix && ibanSuffix.length >= 4 && testo.includes(ibanSuffix)) ||
                (nomeContoLower.length > 3 && testo.includes(nomeContoLower)) ||
                (nomeBancaLower.length > 4 && testo.includes(nomeBancaLower))
              ) {
                contoDestId = c.id;
                break;
              }
            }
            if (contoDestId) {
              await supabaseAdmin
                .from('movimenti_banca')
                .update({ conto_destinazione_id: contoDestId })
                .eq('id', movimento_id);
            }
          }
        }
      }
    } else if (scadenza_id) {
      await confermaRiconciliazione(
        movimento_id, 
        scadenza_id, 
        importo, 
        'confermato_utente',
        resolvedSoggettoId || soggetto_id || undefined
      );
    } else if (resolvedSoggettoId || soggetto_id) {
      const finalSoggettoId = resolvedSoggettoId || soggetto_id;
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ 
          stato_riconciliazione: 'riconciliato', 
          soggetto_id: finalSoggettoId,
          categoria_dedotta: categoria || 'fattura',
          ...(note_riconciliazione ? { note_riconciliazione } : {})
        })
        .eq('id', movimento_id);

      await allocaPagamentoIntelligente(supabaseAdmin, finalSoggettoId!, importo, movimento_id);
      
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

export async function quickCreateSoggetto(formData: FormData) {
  try {
    const ragione_sociale = (formData.get('ragione_sociale') as string || '').trim();
    const tipo = (formData.get('tipo') as string) || 'fornitore';
    const partita_iva = (formData.get('partita_iva') as string || '').trim() || null;

    if (!ragione_sociale) return { error: 'Ragione sociale obbligatoria' };

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabaseAdmin
      .from('anagrafica_soggetti')
      .insert({ ragione_sociale, tipo, partita_iva })
      .select('id')
      .single();

    if (error) return { error: error.message };

    revalidatePath('/anagrafiche');
    return { success: true, soggetto_id: data.id };
  } catch (error: any) {
    console.error('❌ Errore quick-create soggetto:', error);
    return { error: error.message };
  }
}

// ==========================================
// SPLIT MULTI-FATTURA
// ==========================================
export async function handleConfermaSplit(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const note_riconciliazione = (formData.get('note_riconciliazione') as string || '').trim() || null;
    const allocazioniJson = formData.get('allocazioni') as string;
    const allocazioni: Array<{ scadenza_id: string; importo: number }> = JSON.parse(allocazioniJson);

    if (!movimento_id || !allocazioni?.length) {
      return { error: 'Dati mancanti per lo split' };
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const soggettoIds = new Set<string>();

    for (const alloc of allocazioni) {
      // 1. Leggi scadenza
      const { data: scadenza, error: errScad } = await supabaseAdmin
        .from('scadenze_pagamento')
        .select('importo_totale, importo_pagato, soggetto_id')
        .eq('id', alloc.scadenza_id)
        .single();

      if (errScad || !scadenza) {
        console.error(`❌ Scadenza ${alloc.scadenza_id} non trovata:`, errScad);
        continue;
      }

      if (scadenza.soggetto_id) soggettoIds.add(scadenza.soggetto_id);

      // 2. Aggiorna importo_pagato sulla scadenza
      const nuovoPagato = (Number(scadenza.importo_pagato) || 0) + Math.abs(alloc.importo);
      const nuovoStato = nuovoPagato >= Number(scadenza.importo_totale) - 0.01 ? 'pagato' : 'parziale';

      await supabaseAdmin
        .from('scadenze_pagamento')
        .update({
          importo_pagato: nuovoPagato,
          stato: nuovoStato,
          data_pagamento: new Date().toISOString().split('T')[0]
        })
        .eq('id', alloc.scadenza_id);
    }

    // 3. Aggiorna movimento bancario
    await supabaseAdmin
      .from('movimenti_banca')
      .update({
        stato_riconciliazione: 'riconciliato',
        scadenza_id: allocazioni[0].scadenza_id,
        soggetto_id: [...soggettoIds][0] || null,
        categoria_dedotta: 'fattura',
        ai_motivo: `Split: ${allocazioni.length} fatture da ${soggettoIds.size} fornitore${soggettoIds.size !== 1 ? 'i' : ''}`,
        ...(note_riconciliazione ? { note_riconciliazione } : {})
      })
      .eq('id', movimento_id);

    revalidatePath('/finanza/riconciliazione');
    revalidatePath('/finanza');
    revalidatePath('/scadenze');
    revalidatePath('/anagrafiche');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Errore split multi-fattura:', error);
    return { error: error.message };
  }
}

// ==========================================
// LOGICA INTERNA (PRIVATE)
// ==========================================
async function allocaPagamentoIntelligente(supabaseAdmin: any, soggetto_id: string, importo_pagato: number, movimento_id: string) {
  const { data: scadenzeAperte } = await supabaseAdmin
    .from('scadenze_pagamento')
    .select('id, importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id)
    .neq('stato', 'pagato')
    .order('data_scadenza', { ascending: true });

  if (!scadenzeAperte || scadenzeAperte.length === 0) {
    await supabaseAdmin
      .from('movimenti_banca')
      .update({ ai_motivo: 'Acconto non allocato: nessuna fattura aperta disponibile' })
      .eq('id', movimento_id);
    return;
  }

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
  }

  if (combinazioneEsatta) {
    const primaScadenzaId = combinazioneEsatta[0]?.id || null;
    for (const scadenza of combinazioneEsatta) {
      await supabaseAdmin
        .from('scadenze_pagamento')
        .update({ importo_pagato: scadenza.importo_totale, stato: 'pagato' })
        .eq('id', scadenza.id);
    }

    if (primaScadenzaId) {
      await supabaseAdmin
        .from('movimenti_banca')
        .update({ scadenza_id: primaScadenzaId, ai_motivo: 'Allocato automaticamente (combinazione esatta)' })
        .eq('id', movimento_id);
    }
    return;
  }

  let budgetResiduoCents = targetCents;
  let primaScadenzaId: string | null = null;

  for (const scadenza of items) {
    if (budgetResiduoCents <= 0) break;

    const daPagareCents = Math.min(scadenza.residuoCents, budgetResiduoCents);
    if (daPagareCents <= 0) continue;
    budgetResiduoCents -= daPagareCents;

    if (!primaScadenzaId) {
      primaScadenzaId = scadenza.id;
    }

    const vecchioPagatoEuro = Number(scadenza.importo_pagato || 0);
    const nuovoPagatoEuro = vecchioPagatoEuro + (daPagareCents / 100);
    
    const nuovoStato = (nuovoPagatoEuro >= Number(scadenza.importo_totale) - 0.01) ? 'pagato' : 'parziale';

    await supabaseAdmin
      .from('scadenze_pagamento')
      .update({ importo_pagato: nuovoPagatoEuro, stato: nuovoStato })
      .eq('id', scadenza.id);
  }

  if (primaScadenzaId) {
    await supabaseAdmin
      .from('movimenti_banca')
      .update({ scadenza_id: primaScadenzaId, ai_motivo: 'Allocato automaticamente (FIFO)' })
      .eq('id', movimento_id);
  } else {
    await supabaseAdmin
      .from('movimenti_banca')
      .update({ ai_motivo: 'Acconto non allocato: importo senza capienza su fatture aperte' })
      .eq('id', movimento_id);
  }
}

export async function rinominaEstrattoConto(id: string, nuovoNome: string) {
  const supabase = await createClient()
  
  let nomeFinale = nuovoNome
  const { data: doc } = await supabase.from('estratti_conto').select('nome_file').eq('id', id).single()
  
  if (doc) {
    const extMatch = doc.nome_file.match(/\.[0-9a-z]+$/i)
    const originalExt = extMatch ? extMatch[0] : ''
    if (originalExt && !nomeFinale.endsWith(originalExt)) {
      nomeFinale += originalExt
    }
  }

  const { error } = await supabase.from('estratti_conto').update({ nome_file: nomeFinale }).eq('id', id)
  if (error) throw new Error("Impossibile rinominare l'estratto conto")
  
  revalidatePath('/finanza/riconciliazione')
  return true
}