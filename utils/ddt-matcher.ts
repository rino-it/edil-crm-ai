import { createClient } from '@/utils/supabase/server';

export interface DDTMatchResult {
  cantiere_id: string | null;
  confidence: number; // 0-100
  reason: string;
}

/**
 * Analizza i riferimenti DDT presenti nella fattura XML per tentare di dedurre il Cantiere.
 * Lavora in sola lettura senza interferire con la logica di caricamento DDT via WhatsApp.
 * * @param ddtReferences Array di stringhe contenenti i numeri/riferimenti DDT estratti dall'XML
 */
export async function matchDDTtoCantiere(ddtReferences: string[]): Promise<DDTMatchResult> {
  // Se non ci sono DDT nella fattura, restituiamo subito null
  if (!ddtReferences || ddtReferences.length === 0) {
    return { 
      cantiere_id: null, 
      confidence: 0, 
      reason: "Nessun riferimento DDT presente nell'XML." 
    };
  }

  try {
    const supabase = await createClient();
    
    // 1. Recuperiamo i cantieri attivi (basta il codice e l'id)
    const { data: cantieri, error } = await supabase
      .from('cantieri')
      .select('id, codice, titolo')
      .neq('status', 'chiuso'); // Escludiamo i cantieri chiusi per ottimizzare la ricerca

    if (error || !cantieri) {
      console.error("Errore recupero cantieri per match DDT:", error);
      return { cantiere_id: null, confidence: 0, reason: "Errore lettura cantieri." };
    }

    // Uniamo tutti i riferimenti DDT in un'unica stringa uppercase per una ricerca più facile
    const stringaRicerca = ddtReferences.filter(Boolean).join(" | ").toUpperCase();

    // 2. Logica di Matching (Ricerca del Codice Cantiere nel testo del DDT)
    // Spesso in edilizia il DDT riporta il codice cantiere (es. "DDT n.45 - Cantiere VIL-001")
    for (const cantiere of cantieri) {
      if (!cantiere.codice) continue;
      
      const codiceCantiere = cantiere.codice.toUpperCase();

      // Utilizziamo una regex per assicurarci di trovare la parola intera
      // per evitare che il cantiere "12" venga matchato nel DDT "1234"
      const regexStrict = new RegExp(`\\b${codiceCantiere}\\b`);
      
      if (regexStrict.test(stringaRicerca)) {
        return {
          cantiere_id: cantiere.id,
          confidence: 85, // Confidenza alta perché il codice esatto è presente nel DDT
          reason: `Il codice cantiere '${cantiere.codice}' è stato rilevato all'interno del riferimento DDT.`
        };
      }
    }

    // Se arriviamo qui, l'XML aveva dei DDT ma non contenevano nessun codice cantiere testuale noto.
    // (In futuro si potrebbe interrogare la tabella dei DDT di WhatsApp per incrociare i dati)
    return { 
      cantiere_id: null, 
      confidence: 0, 
      reason: "DDT presenti, ma nessun codice cantiere rilevato nel testo." 
    };

  } catch (err) {
    console.error("Errore nel ddt-matcher:", err);
    return { cantiere_id: null, confidence: 0, reason: "Errore interno del matcher." };
  }
}