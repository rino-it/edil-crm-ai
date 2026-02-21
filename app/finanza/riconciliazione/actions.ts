'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { parseCSVBanca, importMovimentiBanca, confermaRiconciliazione } from '@/utils/data-fetcher'

export async function importaCSVBanca(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) throw new Error("Nessun file CSV selezionato.");

    const text = await file.text();
    const movimenti = parseCSVBanca(text);

    if (movimenti.length === 0) {
      throw new Error("Nessun movimento valido trovato. Verifica il formato del CSV.");
    }

    // Inserimento massivo nel database
    const inseriti = await importMovimentiBanca(movimenti);

    revalidatePath('/finanza/riconciliazione');
    return { success: true, conteggio: inseriti?.length || 0 };
  } catch (error: any) {
    console.error("❌ Errore importazione CSV:", error);
    return { error: error.message };
  }
}

export async function confermaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string;
    const importo = Number(formData.get('importo'));

    if (!movimento_id || !scadenza_id) {
      throw new Error("Dati mancanti per la conferma della riconciliazione.");
    }

    // Aggiorna saldo scadenza e stato movimento
    await confermaRiconciliazione(movimento_id, scadenza_id, importo);

    // Aggiorna tutte le viste finanziarie
    revalidatePath('/finanza/riconciliazione');
    revalidatePath('/finanza');
    revalidatePath('/scadenze');
    return { success: true };
  } catch (error: any) {
    console.error("❌ Errore conferma match:", error);
    return { error: error.message };
  }
}

export async function rifiutaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    if (!movimento_id) throw new Error("ID movimento mancante.");

    const supabase = await createClient();
    
    // Rimuove la deduzione dell'AI, mantenendo lo stato 'non_riconciliato'
    const { error } = await supabase
      .from('movimenti_banca')
      .update({ ai_suggerimento: null, ai_confidence: null, ai_motivo: null })
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
  // Il match manuale esegue la stessa esatta transazione amministrativa della conferma AI
  return confermaMatch(formData);
}