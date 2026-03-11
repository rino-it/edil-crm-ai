'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { parseCSVBanca, parseXMLBanca, parseXLSBanca, importMovimentiBanca, confermaRiconciliazione, creaLogRiconciliazione, inserisciMutuoConRate, inserisciTitolo, normalizzaNome } from '@/utils/data-fetcher'

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
// GESTIONE MUTUI
// ==========================================
export async function creaMutuo(formData: FormData) {
  const conto_banca_id = formData.get("conto_banca_id") as string;
  const banca_erogante = formData.get("banca_erogante") as string;
  const numero_rate = parseInt(formData.get("numero_rate") as string);
  const capitale_erogato = parseFloat(formData.get("capitale_erogato") as string);
  const importo_rata = parseFloat(formData.get("importo_rata") as string);
  const tipo_tasso = formData.get("tipo_tasso") as 'fisso' | 'variabile' | 'misto';
  const periodicita = formData.get("periodicita") as 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';
  const data_prima_rata = formData.get("data_prima_rata") as string;

  if (!conto_banca_id || !banca_erogante || !numero_rate || !capitale_erogato || !importo_rata || !data_prima_rata) {
    throw new Error("Dati obbligatori mancanti per il mutuo");
  }

  const taeg = formData.get("taeg_isc") as string;

  await inserisciMutuoConRate({
    conto_banca_id,
    banca_erogante,
    numero_pratica: (formData.get("numero_pratica") as string) || undefined,
    soggetto_id: (formData.get("soggetto_id") as string) || undefined,
    numero_rate,
    scopo: (formData.get("scopo") as string) || undefined,
    capitale_erogato,
    tipo_tasso,
    taeg_isc: taeg ? parseFloat(taeg) : undefined,
    spese_istruttoria: parseFloat((formData.get("spese_istruttoria") as string) || "0"),
    spese_perizia: parseFloat((formData.get("spese_perizia") as string) || "0"),
    spese_incasso_rata: parseFloat((formData.get("spese_incasso_rata") as string) || "0"),
    spese_gestione_pratica: parseFloat((formData.get("spese_gestione_pratica") as string) || "0"),
    periodicita,
    data_prima_rata,
    data_stipula: (formData.get("data_stipula") as string) || undefined,
    importo_rata,
    note: (formData.get("note") as string) || undefined,
  });

  revalidatePath('/finanza/riconciliazione');
}

// ==========================================
// GESTIONE TITOLI (Assegni/Cambiali)
// ==========================================
export async function creaTitolo(formData: FormData) {
  const tipo = formData.get("tipo") as 'assegno' | 'cambiale';
  const importo = parseFloat(formData.get("importo") as string);
  const data_scadenza = formData.get("data_scadenza") as string;
  const scadenza_id = (formData.get("scadenza_id") as string) || undefined;

  if (!tipo || !importo || !data_scadenza) {
    throw new Error("Dati obbligatori mancanti per il titolo");
  }

  const soggetto_id = (formData.get("soggetto_id") as string) || undefined;

  // Risolvi il nome del fornitore dal soggetto selezionato
  let fornitore: string | undefined
  if (soggetto_id) {
    const { createClient: createAdminClient } = await import('@/utils/supabase/server')
    const supabase = await createAdminClient()
    const { data: sogg } = await supabase
      .from('anagrafica_soggetti')
      .select('ragione_sociale')
      .eq('id', soggetto_id)
      .single()
    fornitore = sogg?.ragione_sociale || undefined
  }

  await inserisciTitolo({
    tipo,
    importo,
    data_scadenza,
    scadenza_id,
    soggetto_id,
    fornitore,
    data_emissione: (formData.get("data_emissione") as string) || undefined,
    banca_incasso: (formData.get("banca_incasso") as string) || undefined,
    numero_titolo: (formData.get("numero_titolo") as string) || undefined,
    note: (formData.get("note") as string) || undefined,
  });

  revalidatePath('/finanza/riconciliazione');
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
    // 2. GESTIONE XML / CSV / XLS / XLSX
    // ----------------------------------------------------
    let movimenti: any[] = [];
    if (fileName.endsWith('.xml')) {
      const text = await file.text();
      // SpreadsheetML XML (BPER esporta Excel con estensione .xml)
      if (text.includes('schemas-microsoft-com:office:spreadsheet') || text.includes('progid="Excel.Sheet"')) {
        const buffer = new TextEncoder().encode(text).buffer;
        movimenti = parseXLSBanca(buffer);
      } else {
        movimenti = parseXMLBanca(text);
      }
    } else if (fileName.endsWith('.csv')) {
      const text = await file.text();
      movimenti = parseCSVBanca(text);
    } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
      const buffer = await file.arrayBuffer();
      movimenti = parseXLSBanca(buffer);
    } else {
      throw new Error("Formato non supportato. Usa file .pdf, .csv, .xml, .xls o .xlsx");
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
        tipo: fileName.endsWith('.xml') ? 'xml' : (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) ? 'xls' : 'csv'
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
    const isNotaCredito = formData.get('is_nota_credito') === 'true';

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
          .select('descrizione, ai_motivo, conto_banca_id, note_riconciliazione')
          .eq('id', movimento_id)
          .single();

        if (mov) {
          const testo = `${mov.descrizione || ''} ${mov.ai_motivo || ''} ${mov.note_riconciliazione || ''}`.toLowerCase();
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
        resolvedSoggettoId || soggetto_id || undefined,
        undefined,
        undefined,
        isNotaCredito
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
      // Fallback attivo: cerca soggetto e titolo/scadenza dalla descrizione del movimento
      const { data: movFallback } = await supabaseAdmin
        .from('movimenti_banca')
        .select('soggetto_id, ai_suggerimento, descrizione, data_operazione, data_valuta, categoria_dedotta')
        .eq('id', movimento_id)
        .single();

      // 1. Se ci sono dati pre-match (ai_suggerimento / soggetto_id), usali
      if (movFallback?.ai_suggerimento) {
        await confermaRiconciliazione(
          movimento_id, movFallback.ai_suggerimento, importo, 'confermato_utente',
          movFallback.soggetto_id || undefined,
          undefined, undefined, isNotaCredito
        );
      } else {
        // 2. Ricerca attiva: trova soggetto dal testo della descrizione
        const descrizione = movFallback?.descrizione || '';
        const descNorm = normalizzaNome(descrizione);
        let foundSoggettoId = movFallback?.soggetto_id || null;
        let foundSoggettoNome = '';

        if (!foundSoggettoId && descrizione.length > 3) {
          const { data: tuttiSoggetti } = await supabaseAdmin
            .from('anagrafica_soggetti')
            .select('id, ragione_sociale');

          if (tuttiSoggetti) {
            for (const s of tuttiSoggetti) {
              const nomeNorm = normalizzaNome(s.ragione_sociale);
              if (nomeNorm.length >= 4 && descNorm.includes(nomeNorm)) {
                foundSoggettoId = s.id;
                foundSoggettoNome = s.ragione_sociale;
                break;
              }
            }
          }
        }

        // 3. Se la descrizione contiene cambiale/assegno/tratta, cerca titolo collegato
        const regexTitolo = /\b(cambial[ie]|tratt[ae]|assegn[io]|pagar[oò]|effett[io]|ri\.?ba\.?|addebito\s+cambial[ie])\b/i;
        const isTitolo = regexTitolo.test(descrizione);

        if (isTitolo && foundSoggettoId) {
          const importoAbs = Math.abs(importo);
          const dataMov = movFallback?.data_operazione || movFallback?.data_valuta || new Date().toISOString().slice(0, 10);

          const { data: titoli } = await supabaseAdmin
            .from('titoli')
            .select('id, tipo, importo, scadenza_id, soggetto_id')
            .eq('soggetto_id', foundSoggettoId)
            .eq('stato', 'in_essere')
            .gte('data_scadenza', new Date(new Date(dataMov).getTime() - 30 * 86400000).toISOString().slice(0, 10))
            .lte('data_scadenza', new Date(new Date(dataMov).getTime() + 30 * 86400000).toISOString().slice(0, 10));

          let titoloFound: any = null;
          if (titoli && titoli.length > 0) {
            titoloFound = titoli.find((t: any) => Math.abs(t.importo - importoAbs) <= 0.50);
            if (!titoloFound && titoli.length === 1) {
              titoloFound = titoli[0];
            }
          }

          if (titoloFound?.scadenza_id) {
            await confermaRiconciliazione(
              movimento_id, titoloFound.scadenza_id, importo, 'confermato_utente', foundSoggettoId,
              undefined, undefined, isNotaCredito
            );
          } else if (titoloFound) {
            // Titolo senza scadenza collegata: marca titolo come pagato e riconcilia movimento
            await supabaseAdmin
              .from('titoli')
              .update({
                stato: 'pagato',
                data_pagamento: new Date().toISOString().split('T')[0],
                movimento_banca_id: movimento_id,
              })
              .eq('id', titoloFound.id);
            await supabaseAdmin
              .from('movimenti_banca')
              .update({
                stato_riconciliazione: 'riconciliato',
                soggetto_id: foundSoggettoId,
                categoria_dedotta: categoria || 'fattura',
                ...(note_riconciliazione ? { note_riconciliazione } : {})
              })
              .eq('id', movimento_id);
            await allocaPagamentoIntelligente(supabaseAdmin, foundSoggettoId, importo, movimento_id);
          } else {
            // Titolo non trovato ma soggetto si: riconcilia con soggetto
            await supabaseAdmin
              .from('movimenti_banca')
              .update({
                stato_riconciliazione: 'riconciliato',
                soggetto_id: foundSoggettoId,
                categoria_dedotta: categoria || 'fattura',
                ...(note_riconciliazione ? { note_riconciliazione } : {})
              })
              .eq('id', movimento_id);
            await allocaPagamentoIntelligente(supabaseAdmin, foundSoggettoId, importo, movimento_id);
          }
        } else if (foundSoggettoId) {
          // Non e' un titolo ma abbiamo il soggetto: riconcilia con allocazione intelligente
          await supabaseAdmin
            .from('movimenti_banca')
            .update({
              stato_riconciliazione: 'riconciliato',
              soggetto_id: foundSoggettoId,
              categoria_dedotta: categoria || 'fattura',
              ...(note_riconciliazione ? { note_riconciliazione } : {})
            })
            .eq('id', movimento_id);
          await allocaPagamentoIntelligente(supabaseAdmin, foundSoggettoId, importo, movimento_id);
        } else {
          // Nessun soggetto trovato: marca come riconciliato senza associazione
          await supabaseAdmin
            .from('movimenti_banca')
            .update({
              stato_riconciliazione: 'riconciliato',
              categoria_dedotta: categoria || 'fattura',
              ...(note_riconciliazione ? { note_riconciliazione } : {})
            })
            .eq('id', movimento_id);
        }
      }
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

// ==========================================
// ANTEPRIMA RICONCILIAZIONE (READ-ONLY)
// ==========================================
export interface AnteprimaRiconciliazione {
  tipo: 'scadenza' | 'soggetto_allocazione' | 'titolo' | 'categoria_speciale' | 'nota_credito' | 'fallback_soggetto' | 'nessun_match'
  label: string
  isNotaCredito: boolean
  soggetto?: { id: string; ragione_sociale: string }
  scadenza?: {
    id: string
    fattura_riferimento: string | null
    importo_totale: number
    residuo_prima: number
    residuo_dopo: number
    stato_dopo: 'pagato' | 'parziale'
  }
  titolo?: { id: string; tipo: string; numero_titolo: string | null; importo: number }
  allocazione_fifo?: Array<{
    scadenza_id: string
    fattura_riferimento: string | null
    importo_applicato: number
    residuo_prima: number
    residuo_dopo: number
  }>
  categoria?: string
  importo_movimento: number
  warning?: string
}

const CATEGORIE_SPECIALI = ['commissione', 'giroconto', 'carta_credito', 'stipendio', 'leasing', 'ente_pubblico', 'cassa_edile', 'cessione_quinto', 'utenza', 'assicurazione', 'f24', 'finanziamento_socio', 'interessi_bancari', 'mutuo'];

const LABEL_CATEGORIE: Record<string, string> = {
  commissione: 'Commissione bancaria',
  giroconto: 'Giroconto',
  carta_credito: 'Carta di credito',
  stipendio: 'Stipendio',
  leasing: 'Leasing',
  ente_pubblico: 'Ente pubblico',
  cassa_edile: 'Cassa edile',
  cessione_quinto: 'Cessione del quinto',
  utenza: 'Utenza',
  assicurazione: 'Assicurazione',
  f24: 'F24 / Imposte',
  finanziamento_socio: 'Finanziamento socio',
  interessi_bancari: 'Interessi bancari',
  mutuo: 'Mutuo',
};

export async function getAnteprimaRiconciliazione(formData: FormData): Promise<AnteprimaRiconciliazione> {
  const movimento_id = formData.get('movimento_id') as string;
  const scadenza_id = formData.get('scadenza_id') as string | null;
  const soggetto_id = formData.get('soggetto_id') as string | null;
  const categoria = formData.get('categoria') as string;
  const importo = Number(formData.get('importo'));
  const manual_filter = (formData.get('manual_filter') as string || '').trim();

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Recupera il movimento per sapere segno e descrizione
  const { data: movimento } = await supabaseAdmin
    .from('movimenti_banca')
    .select('importo, descrizione, soggetto_id, ai_suggerimento, data_operazione, data_valuta')
    .eq('id', movimento_id)
    .single();

  const importoReale = movimento?.importo || importo;
  const isEntrata = importoReale > 0;

  // Risolvi soggetto_id (stessa logica di handleConferma)
  let resolvedSoggettoId = soggetto_id;
  if (!CATEGORIE_SPECIALI.includes(categoria) && !scadenza_id && !soggetto_id && manual_filter && manual_filter.length >= 3) {
    const { data: soggetti } = await supabaseAdmin
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale, tipo')
      .ilike('ragione_sociale', `%${manual_filter}%`);
    if (soggetti && soggetti.length === 1) {
      resolvedSoggettoId = soggetti[0].id;
    }
  }

  // Helper: determina se e' nota di credito (entrata da fornitore)
  async function checkNotaCredito(soggettoId: string): Promise<boolean> {
    if (!isEntrata) return false;
    const { data: sogg } = await supabaseAdmin
      .from('anagrafica_soggetti')
      .select('tipo')
      .eq('id', soggettoId)
      .single();
    return sogg?.tipo === 'fornitore';
  }

  // Helper: recupera info soggetto
  async function getSoggettoInfo(soggettoId: string) {
    const { data } = await supabaseAdmin
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale')
      .eq('id', soggettoId)
      .single();
    return data ? { id: data.id, ragione_sociale: data.ragione_sociale } : undefined;
  }

  // === CATEGORIA SPECIALE ===
  if (CATEGORIE_SPECIALI.includes(categoria)) {
    return {
      tipo: 'categoria_speciale',
      label: `Registrazione: ${LABEL_CATEGORIE[categoria] || categoria}. Nessuna scadenza collegata.`,
      isNotaCredito: false,
      categoria,
      importo_movimento: importo,
    };
  }

  // === SCADENZA ESPLICITA ===
  if (scadenza_id) {
    const { data: scad } = await supabaseAdmin
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, soggetto_id, tipo, anagrafica_soggetti(ragione_sociale)')
      .eq('id', scadenza_id)
      .single();

    if (scad) {
      const finalSoggettoId = resolvedSoggettoId || soggetto_id || scad.soggetto_id;
      const notaCredito = isEntrata && scad.tipo === 'uscita';
      const residuoPrima = Number(scad.importo_totale) - Number(scad.importo_pagato || 0);
      let residuoDopo: number;
      let statoDopo: 'pagato' | 'parziale';

      if (notaCredito) {
        const nuovoTotale = Math.max(0, Number(scad.importo_totale) - Math.abs(importo));
        residuoDopo = nuovoTotale - Number(scad.importo_pagato || 0);
        statoDopo = residuoDopo <= 0.01 ? 'pagato' : 'parziale';
      } else {
        const nuovoPagato = Number(scad.importo_pagato || 0) + Math.abs(importo);
        residuoDopo = Number(scad.importo_totale) - nuovoPagato;
        statoDopo = residuoDopo <= 0.01 ? 'pagato' : 'parziale';
      }

      const soggNome = (scad as any).anagrafica_soggetti?.ragione_sociale || '';
      const label = notaCredito
        ? `Nota di credito da ${soggNome}. Riduzione debito fattura ${scad.fattura_riferimento || 'N/A'}: ${residuoPrima.toFixed(2)} -> ${Math.max(0, residuoDopo).toFixed(2)}`
        : `Pagamento fattura ${scad.fattura_riferimento || 'N/A'} di ${soggNome}. Residuo: ${residuoPrima.toFixed(2)} -> ${Math.max(0, residuoDopo).toFixed(2)}. Stato -> ${statoDopo}`;

      return {
        tipo: notaCredito ? 'nota_credito' : 'scadenza',
        label,
        isNotaCredito: notaCredito,
        soggetto: soggNome ? { id: finalSoggettoId || '', ragione_sociale: soggNome } : undefined,
        scadenza: {
          id: scad.id,
          fattura_riferimento: scad.fattura_riferimento,
          importo_totale: Number(scad.importo_totale),
          residuo_prima: residuoPrima,
          residuo_dopo: Math.max(0, residuoDopo),
          stato_dopo: statoDopo,
        },
        importo_movimento: importo,
      };
    }
  }

  // === SOGGETTO ESPLICITO (allocazione intelligente) ===
  if (resolvedSoggettoId || soggetto_id) {
    const finalSoggettoId = (resolvedSoggettoId || soggetto_id)!;
    const soggettoInfo = await getSoggettoInfo(finalSoggettoId);
    const notaCredito = await checkNotaCredito(finalSoggettoId);

    // Simula allocazione FIFO read-only
    const { data: scadenzeAperte } = await supabaseAdmin
      .from('scadenze_pagamento')
      .select('id, importo_totale, importo_pagato, fattura_riferimento, stato')
      .eq('soggetto_id', finalSoggettoId)
      .neq('stato', 'pagato')
      .order('data_scadenza', { ascending: true });

    if (!scadenzeAperte || scadenzeAperte.length === 0) {
      return {
        tipo: notaCredito ? 'nota_credito' : 'soggetto_allocazione',
        label: notaCredito
          ? `Nota di credito da ${soggettoInfo?.ragione_sociale || ''}. Nessuna fattura aperta su cui applicare il credito.`
          : `Pagamento a ${soggettoInfo?.ragione_sociale || ''}. Nessuna fattura aperta — acconto non allocabile.`,
        isNotaCredito: notaCredito,
        soggetto: soggettoInfo,
        importo_movimento: importo,
        warning: 'Nessuna fattura aperta per questo soggetto',
      };
    }

    // Simulazione FIFO (read-only)
    const targetCents = Math.round(importo * 100);
    const items = scadenzeAperte.map((s: any) => ({
      ...s,
      residuoCents: Math.round((Number(s.importo_totale) - Number(s.importo_pagato || 0)) * 100)
    }));

    const allocazioni: AnteprimaRiconciliazione['allocazione_fifo'] = [];
    let budgetCents = targetCents;

    // Combinazione esatta
    let combinazioneEsatta: any[] | null = null;
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
      for (const s of combinazioneEsatta) {
        const residuoPrima = s.residuoCents / 100;
        allocazioni.push({
          scadenza_id: s.id,
          fattura_riferimento: s.fattura_riferimento,
          importo_applicato: residuoPrima,
          residuo_prima: residuoPrima,
          residuo_dopo: 0,
        });
      }
    } else {
      for (const s of items) {
        if (budgetCents <= 0) break;
        const daPagareCents = Math.min(s.residuoCents, budgetCents);
        if (daPagareCents <= 0) continue;
        budgetCents -= daPagareCents;
        const residuoPrima = s.residuoCents / 100;
        allocazioni.push({
          scadenza_id: s.id,
          fattura_riferimento: s.fattura_riferimento,
          importo_applicato: daPagareCents / 100,
          residuo_prima: residuoPrima,
          residuo_dopo: (s.residuoCents - daPagareCents) / 100,
        });
      }
    }

    const metodo = combinazioneEsatta ? 'combinazione esatta' : 'FIFO';
    return {
      tipo: notaCredito ? 'nota_credito' : 'soggetto_allocazione',
      label: notaCredito
        ? `Nota di credito da ${soggettoInfo?.ragione_sociale || ''}. Riduzione debito su ${allocazioni.length} fattur${allocazioni.length === 1 ? 'a' : 'e'}.`
        : `Pagamento a ${soggettoInfo?.ragione_sociale || ''}. Allocazione ${metodo} su ${allocazioni.length} fattur${allocazioni.length === 1 ? 'a' : 'e'}.`,
      isNotaCredito: notaCredito,
      soggetto: soggettoInfo,
      allocazione_fifo: allocazioni,
      importo_movimento: importo,
    };
  }

  // === FALLBACK: cerca soggetto e titolo dalla descrizione ===
  const descrizione = movimento?.descrizione || '';
  const descNorm = normalizzaNome(descrizione);
  let foundSoggettoId = movimento?.soggetto_id || null;
  let foundSoggettoNome = '';

  // Se ci sono dati pre-match, usali
  if (movimento?.ai_suggerimento) {
    const { data: scad } = await supabaseAdmin
      .from('scadenze_pagamento')
      .select('id, fattura_riferimento, importo_totale, importo_pagato, soggetto_id, tipo, anagrafica_soggetti(ragione_sociale)')
      .eq('id', movimento.ai_suggerimento)
      .single();

    if (scad) {
      const soggNome = (scad as any).anagrafica_soggetti?.ragione_sociale || '';
      const residuoPrima = Number(scad.importo_totale) - Number(scad.importo_pagato || 0);
      const notaCredito = isEntrata && scad.tipo === 'uscita';
      let residuoDopo: number;
      if (notaCredito) {
        residuoDopo = Math.max(0, Number(scad.importo_totale) - Math.abs(importo)) - Number(scad.importo_pagato || 0);
      } else {
        residuoDopo = Number(scad.importo_totale) - (Number(scad.importo_pagato || 0) + Math.abs(importo));
      }
      const statoDopo: 'pagato' | 'parziale' = residuoDopo <= 0.01 ? 'pagato' : 'parziale';

      return {
        tipo: notaCredito ? 'nota_credito' : 'scadenza',
        label: notaCredito
          ? `Nota di credito da ${soggNome}. Riduzione debito fattura ${scad.fattura_riferimento || 'N/A'}: ${residuoPrima.toFixed(2)} -> ${Math.max(0, residuoDopo).toFixed(2)}`
          : `Pagamento fattura ${scad.fattura_riferimento || 'N/A'} di ${soggNome}. Residuo: ${residuoPrima.toFixed(2)} -> ${Math.max(0, residuoDopo).toFixed(2)}. Stato -> ${statoDopo}`,
        isNotaCredito: notaCredito,
        soggetto: soggNome ? { id: scad.soggetto_id || '', ragione_sociale: soggNome } : undefined,
        scadenza: {
          id: scad.id,
          fattura_riferimento: scad.fattura_riferimento,
          importo_totale: Number(scad.importo_totale),
          residuo_prima: residuoPrima,
          residuo_dopo: Math.max(0, residuoDopo),
          stato_dopo: statoDopo,
        },
        importo_movimento: importo,
      };
    }
  }

  // Cerca soggetto nella descrizione
  if (!foundSoggettoId && descrizione.length > 3) {
    const { data: tuttiSoggetti } = await supabaseAdmin
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale');
    if (tuttiSoggetti) {
      for (const s of tuttiSoggetti) {
        const nomeNorm = normalizzaNome(s.ragione_sociale);
        if (nomeNorm.length >= 4 && descNorm.includes(nomeNorm)) {
          foundSoggettoId = s.id;
          foundSoggettoNome = s.ragione_sociale;
          break;
        }
      }
    }
  } else if (foundSoggettoId) {
    const info = await getSoggettoInfo(foundSoggettoId);
    foundSoggettoNome = info?.ragione_sociale || '';
  }

  // Cerca titolo (cambiale/assegno)
  const regexTitolo = /\b(cambial[ie]|tratt[ae]|assegn[io]|pagar[oò]|effett[io]|ri\.?ba\.?|addebito\s+cambial[ie])\b/i;
  const isTitolo = regexTitolo.test(descrizione);

  if (isTitolo && foundSoggettoId) {
    const importoAbs = Math.abs(importo);
    const dataMov = movimento?.data_operazione || movimento?.data_valuta || new Date().toISOString().slice(0, 10);

    const { data: titoli } = await supabaseAdmin
      .from('titoli')
      .select('id, tipo, importo, scadenza_id, soggetto_id, numero_titolo')
      .eq('soggetto_id', foundSoggettoId)
      .eq('stato', 'in_essere')
      .gte('data_scadenza', new Date(new Date(dataMov).getTime() - 30 * 86400000).toISOString().slice(0, 10))
      .lte('data_scadenza', new Date(new Date(dataMov).getTime() + 30 * 86400000).toISOString().slice(0, 10));

    let titoloFound: any = null;
    if (titoli && titoli.length > 0) {
      titoloFound = titoli.find((t: any) => Math.abs(t.importo - importoAbs) <= 0.50);
      if (!titoloFound && titoli.length === 1) titoloFound = titoli[0];
    }

    if (titoloFound) {
      const tipoLabel = titoloFound.tipo === 'assegno' ? 'Assegno' : 'Cambiale';
      return {
        tipo: 'titolo',
        label: `Pagamento ${tipoLabel} ${titoloFound.numero_titolo ? 'n. ' + titoloFound.numero_titolo : ''} di ${foundSoggettoNome}. Importo titolo: ${Number(titoloFound.importo).toFixed(2)}`,
        isNotaCredito: false,
        soggetto: { id: foundSoggettoId, ragione_sociale: foundSoggettoNome },
        titolo: {
          id: titoloFound.id,
          tipo: titoloFound.tipo,
          numero_titolo: titoloFound.numero_titolo,
          importo: Number(titoloFound.importo),
        },
        importo_movimento: importo,
      };
    }
  }

  if (foundSoggettoId) {
    const notaCredito = await checkNotaCredito(foundSoggettoId);
    return {
      tipo: notaCredito ? 'nota_credito' : 'fallback_soggetto',
      label: notaCredito
        ? `Nota di credito da ${foundSoggettoNome}. Il soggetto e' stato identificato dalla descrizione.`
        : `Pagamento a ${foundSoggettoNome} (identificato dalla descrizione). Allocazione automatica sulle fatture aperte.`,
      isNotaCredito: notaCredito,
      soggetto: { id: foundSoggettoId, ragione_sociale: foundSoggettoNome },
      importo_movimento: importo,
    };
  }

  return {
    tipo: 'nessun_match',
    label: 'Nessun soggetto o scadenza trovata. Il movimento sara\' marcato come riconciliato senza associazione.',
    isNotaCredito: false,
    importo_movimento: importo,
    warning: 'Nessun soggetto identificato nella descrizione del movimento',
  };
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

      await creaLogRiconciliazione({
        movimento_id,
        scadenza_id: alloc.scadenza_id,
        importo_applicato: Math.abs(alloc.importo),
        tipo_match: 'split'
      });
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