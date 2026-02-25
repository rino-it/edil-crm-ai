const KEYWORDS: Record<string, string[]> = {
  'ufficio': ['affitto', 'canone', 'ufficio', 'cancelleria', 'pulizie', 'software', 'hosting'],
  'utenza': ['enel', 'eni', 'gas', 'luce', 'energia', 'acqua', 'telefono', 'tim', 'vodafone', 'fastweb', 'internet', 'rifiuti', 'tari'],
  'multa': ['multa', 'contravvenzione', 'sanzione stradale', 'autovelox', 'divieto'],
  'sanzione': ['sanzione', 'penale', 'ammenda', 'ravvedimento'],
  'burocrazia': ['pratica', 'bollo', 'visura', 'camerale', 'cciaa', 'inps', 'inail', 'f24', 'imposte', 'tasse', 'notaio'],
};

/**
 * Analizza la descrizione e la ragione sociale per dedurre la categoria della scadenza.
 * * @param descrizione La causale o descrizione della riga/fattura
 * @param ragioneSociale Il nome del fornitore/cliente
 * @returns La stringa della categoria o null se non trova corrispondenze
 */
export function categorizzaScadenza(
  descrizione?: string | null, 
  ragioneSociale?: string | null
): string | null {
  // Uniamo e normalizziamo il testo per la ricerca (tutto in minuscolo)
  const textToSearch = `${descrizione || ''} ${ragioneSociale || ''}`.toLowerCase();

  if (!textToSearch.trim()) return null;

  for (const [categoria, keywords] of Object.entries(KEYWORDS)) {
    for (const keyword of keywords) {
      // Usiamo una regex con i "word boundary" (\b) per evitare falsi positivi.
      // Esempio: cerchiamo la parola esatta "gas", evitando che matchi all'interno di "gastro" o simili.
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      
      if (regex.test(textToSearch)) {
        return categoria;
      }
    }
  }

  return null; // Nessuna categoria trovata
}