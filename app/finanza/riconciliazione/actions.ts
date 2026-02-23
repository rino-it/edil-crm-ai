'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
// Importa anche il client admin per bypassare RLS nel rifiuto
import { createClient as createAdminClient } from "@supabase/supabase-js"
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

// FIX 2: Aggiunto soggetto_id e gestione acconti
export async function confermaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    const scadenza_id = formData.get('scadenza_id') as string;
    const soggetto_id = formData.get('soggetto_id') as string | null;
    const importo = Number(formData.get('importo'));

    if (!movimento_id) {
      throw new Error("ID movimento mancante.");
    }

    // Se c'è scadenza_id esegue il flusso completo (soggetto_id viene passato opzionalmente)
    if (scadenza_id) {
      await confermaRiconciliazione(
        movimento_id, 
        scadenza_id, 
        importo, 
        'confermato_utente',
        soggetto_id || undefined
      );
    } else if (soggetto_id) {
      // FIX 2B: Acconto senza fattura specifica: segna solo come riconciliato con soggetto
      const supabase = await createClient();
      await supabase
        .from('movimenti_banca')
        .update({ 
          stato: 'riconciliato', 
          soggetto_id: soggetto_id 
        })
        .eq('id', movimento_id);
    } else {
      throw new Error("Dati insufficienti per confermare (manca sia scadenza che soggetto).");
    }

    // Aggiorna tutte le viste finanziarie + Anagrafiche
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

// FIX 5: Uso del Client Admin (Service Role) per evitare blocchi RLS
export async function rifiutaMatch(formData: FormData) {
  try {
    const movimento_id = formData.get('movimento_id') as string;
    if (!movimento_id) throw new Error("ID movimento mancante.");

    // Usa Service Role per bypassare RLS (stesso pattern di data-fetcher)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    // Rimuove la deduzione dell'AI
    const { error } = await supabaseAdmin
      .from('movimenti_banca')
      .update({ 
        ai_suggerimento: null, 
        soggetto_id: null,
        ai_confidence: null, 
        ai_motivo: null 
      })
      .eq('id', movimento_id);

    if (error) {
      console.error("❌ Errore DB rifiuto match:", error);
      throw error;
    }

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