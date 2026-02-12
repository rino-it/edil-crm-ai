'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function uploadComputo(formData: FormData) {
  const supabase = await createClient()

  const file = formData.get('file') as File
  const cantiereId = formData.get('cantiere_id') as string

  if (!file) {
    throw new Error("Nessun file caricato")
  }

  const text = await file.text()
  
  // 1. Pulizia e Parsing CSV (Gestisce sia virgola che punto e virgola)
  const rows = text.split('\n')
  const dataToInsert = []

  // Variabili per mappare le colonne dinamicamente
  let colIndexDescrizione = -1
  let colIndexBudget = -1
  let foundHeader = false

  for (let i = 0; i < rows.length; i++) {
    const rowRaw = rows[i].trim();
    if (!rowRaw) continue;

    // Rimuove caratteri speciali e splitta
    // Nota: il tuo CSV sembra usare la virgola, ma gestiamo anche il ; per sicurezza
    const cols = rowRaw.split(/[,;](?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());

    // 2. Cerchiamo l'intestazione (Header)
    if (!foundHeader) {
      // Cerchiamo la colonna "LAVORAZIONE" o "TIPO"
      const indexLav = cols.findIndex(c => c.toUpperCase().includes('LAVORAZIONE') || c.toUpperCase().includes('TIPO'));
      
      // Cerchiamo la colonna del budget (nel tuo file è "lavori previsti a contratto" o "IMPORTO")
      // Se "lavori previsti" è vuoto, useremo "IMPORTO" come fallback o viceversa a tua scelta.
      // Qui cerco specificamente le colonne del tuo file RIEPILOGO.
      const indexBudget = cols.findIndex(c => 
        c.toLowerCase().includes('previsti a contratto') || 
        c.toLowerCase().includes('lavori a finire') 
      );

      if (indexLav !== -1) {
        colIndexDescrizione = indexLav;
        colIndexBudget = indexBudget; // Se non lo trova è -1
        foundHeader = true;
        console.log(`Trovato Header: Descrizione col ${colIndexDescrizione}, Budget col ${colIndexBudget}`);
        continue; // Salta la riga di intestazione
      }
    }

    // 3. Elaborazione Righe Dati
    if (foundHeader && cols.length > colIndexDescrizione) {
      const descrizione = cols[colIndexDescrizione];
      
      // Saltiamo righe di riepilogo o totali vuoti
      if (!descrizione || descrizione.toUpperCase().includes('TOTALE')) continue;

      // Parsing del Budget (Gestione numeri italiani 1.000,00 o inglesi 1000.00)
      let budgetVal = 0;
      if (colIndexBudget !== -1 && cols[colIndexBudget]) {
        let cleanNum = cols[colIndexBudget].replace(/€/g, '').trim();
        // Se c'è la virgola come decimale e nessun punto, sostituisci virgola con punto
        if (cleanNum.includes(',') && !cleanNum.includes('.')) {
            cleanNum = cleanNum.replace(',', '.');
        }
        budgetVal = parseFloat(cleanNum) || 0;
      }

      // Se abbiamo una descrizione valida, aggiungiamo
      dataToInsert.push({
        cantiere_id: cantiereId,
        codice: cols[0] || '', // Colonna N
        descrizione: descrizione, // Colonna LAVORAZIONE
        unita_misura: 'corpo',    // Default per macro-voci
        quantita: 1,              // Default
        prezzo_unitario: budgetVal, // Mettiamo tutto il budget qui
        // Totale verrà calcolato automaticamente dal DB (quantita * prezzo)
      })
    }
  }

  if (dataToInsert.length === 0) {
    return redirect(`/cantieri/${cantiereId}/computo?error=Nessuna riga valida trovata. Controlla che il CSV abbia la colonna 'LAVORAZIONE'.`)
  }

  // 4. Inserimento nel DB
  // Prima puliamo eventuali vecchie voci per questo cantiere (opzionale, per evitare duplicati in fase di test)
  await supabase.from('computo_voci').delete().eq('cantiere_id', cantiereId)

  const { error } = await supabase
    .from('computo_voci')
    .insert(dataToInsert)

  if (error) {
    console.error("Errore importazione:", error)
    return redirect(`/cantieri/${cantiereId}/computo?error=${encodeURIComponent(error.message)}`)
  }

  // 5. Aggiorniamo il Budget Totale del Cantiere
  const totaleBudget = dataToInsert.reduce((acc, row) => acc + row.prezzo_unitario, 0)
  await supabase.from('cantieri').update({ budget: totaleBudget }).eq('id', cantiereId)

  revalidatePath(`/cantieri/${cantiereId}`)
  redirect(`/cantieri/${cantiereId}/computo`)
}