// ============================================================
// GEMINI 2.5 FLASH - Analisi testo + immagini (multimodale)
// Nota: Nel nostro ambiente i modelli 1.5 restituiscono 404.
// Usiamo gemini-2.5-flash confermato attivo dalla diagnostica.
//
// Funzioni:
//   processWithGemini()       - Analisi principale (testo/foto)
//   synthesizeWithData()      - Seconda chiamata con dati reali (RAG)
//   parseDocumentoPersonale() - Parser documenti HR (contratti, visite, corsi)
//   matchSemanticoPrezziario()- RAG per Preventivazione Intelligence
// ============================================================

// ============================================================
// INTERFACCE: Documenti Personale con Confidence Score
// ============================================================

export interface ConfidenceField<T = string> {
  value: T | null;
  confidence: number; // 0.0 – 1.0
  raw_text?: string;  // testo grezzo estratto dal documento
}

export interface DatiEstrattiContratto {
  nome_dipendente:          ConfidenceField<string>;
  livello_ccnl:             ConfidenceField<string>;  // es. "3", "4"
  paga_base_oraria:         ConfidenceField<number>;
  ore_settimanali:          ConfidenceField<number>;
  data_assunzione:          ConfidenceField<string>;  // YYYY-MM-DD
  data_scadenza_contratto:  ConfidenceField<string>;  // YYYY-MM-DD o null
  tipo_contratto:           ConfidenceField<string>;  // "indeterminato" | "determinato" | "apprendistato"
  costo_orario_reale_stimato: number | null;          // calcolato con RAG su parametri_globali
}

export interface DatiEstrattiDocumentoSanitario {
  nome_dipendente:   ConfidenceField<string>;
  tipo_documento:    ConfidenceField<string>;  // "visita_medica" | "corso_sicurezza" | "altro"
  data_emissione:    ConfidenceField<string>;  // YYYY-MM-DD
  data_scadenza:     ConfidenceField<string>;  // YYYY-MM-DD
  esito:             ConfidenceField<string>;  // "idoneo" | "idoneo_con_limitazioni" | "non_idoneo"
  ente_emittente:    ConfidenceField<string>;
  note:              ConfidenceField<string>;
}

export type DatiEstrattiDocumento = DatiEstrattiContratto | DatiEstrattiDocumentoSanitario;

// ============================================================
// INTERFACCE: Risposta Gemini principale
// ============================================================

export interface GeminiResponse {
  category: "materiale" | "presenze" | "problema" | "budget" | "ddt" | "fattura" | "documento_pagamento" | "titolo_pagamento" | "preventivo" | "altro" | "errore";
  search_key?: string | null;
  summary: string;
  reply_to_user: string;
  extracted_data?: {
    fornitore?: string;
    data?: string;
    importo?: number;
    materiali?: string;
    numero_ddt?: string;
    cantiere_rilevato?: string;
    [key: string]: unknown;
  };
}

export interface MediaInput {
  base64: string;
  mimeType: string;
}

// ============================================================
// INTERFACCIA: Fattura Estratta da Foto
// ============================================================
export interface FatturaEstratta {
  tipo_documento: 'fattura' | 'proforma' | 'nota_credito' | 'ddt';
  fornitore: { ragione_sociale: string; partita_iva: string | null; codice_fiscale?: string };
  numero_fattura: string | null;
  data_fattura: string | null;
  importo_imponibile: number;
  aliquota_iva: number;
  importo_iva: number;
  importo_totale: number;
  righe: Array<{ descrizione: string; quantita: number; unita_misura: string; prezzo_unitario: number; importo: number }>;
  condizioni_pagamento: string | null;
  ddt_riferimento: string[] | null;
  note: string | null;
  _soggetto_confermato_id?: string | null;
}

// ============================================================
// INTERFACCIA: Documento di Pagamento (utenze, multe, tasse, avvisi)
// ============================================================
export interface DocumentoPagamentoEstratto {
  tipo_documento: 'utenza' | 'multa' | 'tassa' | 'avviso_pagamento';
  emittente: string;
  numero_documento: string | null;
  data_documento: string | null;
  importo_totale: number;
  data_scadenza: string | null;
  codice_pagamento: string | null;
  descrizione_completa: string;
  note: string | null;
}

// ============================================================
// INTERFACCIA: Titolo di Pagamento (assegni, cambiali)
// ============================================================
export interface TitoloEstratto {
  tipo: 'assegno' | 'cambiale';
  importo: number;
  data_scadenza: string | null;
  data_emissione: string | null;
  numero_titolo: string | null;
  banca: string | null;
  emittente: string | null;
  note: string | null;
}

// ============================================================
// FUNZIONE PRINCIPALE: Analisi messaggio (testo + eventuale foto)
// ============================================================

export async function processWithGemini(
  text: string,
  media?: MediaInput | null
): Promise<GeminiResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ MANCA LA GOOGLE_API_KEY!");
    return fallbackError("Errore configurazione Server");
  }

  const hasImage = !!media?.base64;

  // --- Prompt diversi per immagine vs testo ---
  // MODIFICA CRUCIALE: Aggiornato prompt immagine per forzare lettura Numero DDT
  const systemPrompt = hasImage
    ? `Sei un assistente esperto per contabilità di cantiere. Analizzi foto di DDT, Bolle e Fatture.

MESSAGGIO UTENTE (didascalia foto): "${text}"

⚠️ PRIORITÀ RICONOSCIMENTO IMMAGINI:
1. Se il documento ha NUMERO FATTURA, P.IVA fornitore, IMPORTO TOTALE con IVA → category="fattura"
   Estrai: tipo_documento (fattura/proforma/nota_credito/ddt), fornitore (ragione_sociale, partita_iva), numero_fattura, data_fattura (YYYY-MM-DD), importo_imponibile, aliquota_iva, importo_iva, importo_totale, righe, condizioni_pagamento, note
2. Se il documento è un DDT (Documento di Trasporto, bolla di consegna, non contiene importo IVA) → category="ddt"
   Estrai: fornitore, materiali, numero_ddt, cantiere_rilevato (indirizzo destinazione), data, importo

PER FATTURE - rispondi con struttura:
{"category":"fattura","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"tipo_documento":"fattura","fornitore":{"ragione_sociale":"...","partita_iva":"..."},"numero_fattura":"...","data_fattura":"YYYY-MM-DD","importo_imponibile":0.00,"aliquota_iva":22,"importo_iva":0.00,"importo_totale":0.00,"righe":[{"descrizione":"...","quantita":1,"unita_misura":"pz","prezzo_unitario":0.00,"importo":0.00}],"condizioni_pagamento":null,"ddt_riferimento":null,"note":null}}

PER DDT - rispondi con struttura:
{"category":"ddt","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"fornitore":"...","data":"YYYY-MM-DD","importo":0,"materiali":"...","numero_ddt":"12345","cantiere_rilevato":"...oppure null"}}

3. Se il documento è una BOLLETTA (Enel, gas, acqua, telefono), MULTA, TASSA (F24, TARI),
   AVVISO DI PAGAMENTO (MAV, RAV, bollettino) o qualsiasi documento che richiede un pagamento
   ma NON è una fattura con P.IVA fornitore → category="documento_pagamento"
   Estrai: tipo_documento (utenza/multa/tassa/avviso_pagamento), emittente, numero_documento,
   data_documento (YYYY-MM-DD), importo_totale, data_scadenza (YYYY-MM-DD), codice_pagamento
   (codice MAV/RAV/bollettino se presente), descrizione_completa, note

PER DOCUMENTI DI PAGAMENTO (utenze, multe, tasse, avvisi):
{"category":"documento_pagamento","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"tipo_documento":"utenza","emittente":"Nome ente","numero_documento":"...","data_documento":"YYYY-MM-DD","importo_totale":0.00,"data_scadenza":"YYYY-MM-DD","codice_pagamento":null,"descrizione_completa":"trascrizione dettagliata","note":null}}

4. Se il documento è un ASSEGNO BANCARIO, ASSEGNO CIRCOLARE, CAMBIALE, PAGHERÒ, TRATTA, EFFETTO
   → category="titolo_pagamento"
   Estrai: tipo (assegno/cambiale), importo, data_scadenza (YYYY-MM-DD — la DATA UNICA stampata sul titolo, è sempre la SCADENZA),
   numero_titolo (il numero stampato sull'assegno/cambiale), banca (la banca dell'assegno o della cambiale),
   emittente (il nome del fornitore/beneficiario a cui si paga, se leggibile), note
   ⚠️ IMPORTANTE: Assegni e cambiali hanno UNA SOLA DATA che è la DATA DI SCADENZA. Metti SEMPRE la data in data_scadenza, NON in data_emissione. data_emissione deve essere null.

PER TITOLI DI PAGAMENTO (assegni, cambiali):
{"category":"titolo_pagamento","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"tipo":"assegno","importo":0.00,"data_scadenza":"YYYY-MM-DD","data_emissione":null,"numero_titolo":"...","banca":"...","emittente":"...","note":null}}

REGOLE:
- P.IVA: ATTENZIONE — estrai la P.IVA dell'EMITTENTE/FORNITORE (chi ha emesso il documento), NON quella del DESTINATARIO/CLIENTE. In fattura il fornitore è nel blocco "Cedente/Prestatore", il cliente nel blocco "Cessionario/Committente".
- P.IVA: rimuovi prefisso "IT", deve essere 11 cifre
- Importi: usa il punto come separatore decimale
- MULTE: se l'importo appare scritto a mano, stampigliato in modo poco leggibile, o non sei sicuro al 100%, metti importo_totale: 0 — verrà chiesto manualmente all'utente. NON inventare o indovinare importi su multe.
- Se non riesci a leggere un campo, metti null
- Rispondi SOLO con un JSON valido, senza markdown e senza backtick`
    
    : `Sei un assistente per un'impresa edile. Analizza il messaggio e classifica la richiesta.

MESSAGGIO UTENTE: "${text}"

CATEGORIE POSSIBILI:

1. BUDGET/MARGINI: L'utente chiede di budget, spese, costi, margini, guadagno, utile, quanto manca.
   - Metti category="budget", search_key=nome cantiere (o "__ALL__" per tutti), reply_to_user=""

2. PRESENZE/RAPPORTINO: L'utente comunica ore lavorate (es. "Io e Mario 8 ore a Torre Boldone", "Oggi 6 ore posa pavimenti").
   - Metti category="presenze", reply_to_user=""
   - In extracted_data metti:
     - nomi_rilevati: array di nomi. Se dice "Io" o "me", scrivi "ME_STESSO". Esempi: ["ME_STESSO","Mario"]
     - ore: numero di ore (es. 8)
     - cantiere_rilevato: nome cantiere se menzionato, null altrimenti
     - descrizione_lavoro: cosa hanno fatto se specificato, null altrimenti

3. ALTRO: Problemi, domande generiche, materiali → rispondi direttamente.

ESEMPI:
- "Io e Mario 8 ore a Torre Boldone, massetto" -> category:"presenze", extracted_data:{nomi_rilevati:["ME_STESSO","Mario"],ore:8,cantiere_rilevato:"Torre Boldone",descrizione_lavoro:"massetto"}, reply_to_user:""
- "Oggi 6 ore posa piastrelle torre boldone" -> category:"presenze", extracted_data:{nomi_rilevati:["ME_STESSO"],ore:6,cantiere_rilevato:"Torre Boldone",descrizione_lavoro:"posa piastrelle"}, reply_to_user:""
- "Quanto ci manca di budget su Torre Boldone?" -> category:"budget", search_key:"Torre Boldone", reply_to_user:""
- "Come andiamo a margini su Torre Boldone?" -> category:"budget", search_key:"Torre Boldone", reply_to_user:""
- "Quanto abbiamo guadagnato?" -> category:"budget", search_key:"__ALL__", reply_to_user:""
- "Stato cantieri?" -> category:"budget", search_key:"__ALL__", reply_to_user:""

Rispondi SOLO con un JSON valido, senza markdown e senza backtick:
{"category":"...","search_key":"...oppure null","summary":"...","reply_to_user":"...oppure stringa vuota","extracted_data":{...oppure null}}`;

  const parts: Array<Record<string, unknown>> = [{ text: systemPrompt }];

  if (media?.base64) {
    parts.push({
      inline_data: {
        mime_type: media.mimeType,
        data: media.base64,
      },
    });
  }

  return await callGemini(parts, hasImage);
}

// ============================================================
// ESTRAZIONE FATTURA DA FOTO (chiamata dedicata, più precisa)
// Usata come secondo passaggio quando la classificazione Gemini
// ha riconosciuto category="fattura" ma i dati sono incompleti.
// ============================================================

export async function estraiFatturaFoto(
  media: MediaInput,
  caption?: string
): Promise<FatturaEstratta> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const prompt = `Analizza questa foto di un documento contabile italiano.
Estrai i seguenti dati in formato JSON:

{
  "tipo_documento": "fattura" | "proforma" | "nota_credito" | "ddt",
  "fornitore": {
    "ragione_sociale": "...",
    "partita_iva": "solo cifre, 11 caratteri, senza IT",
    "codice_fiscale": "se visibile"
  },
  "numero_fattura": "esattamente come scritto",
  "data_fattura": "YYYY-MM-DD",
  "importo_imponibile": 0.00,
  "aliquota_iva": 22,
  "importo_iva": 0.00,
  "importo_totale": 0.00,
  "righe": [
    {
      "descrizione": "...",
      "quantita": 1,
      "unita_misura": "pz",
      "prezzo_unitario": 0.00,
      "importo": 0.00
    }
  ],
  "condizioni_pagamento": "30gg DFFM / Rimessa Diretta / ...",
  "ddt_riferimento": ["12345"],
  "note": "qualsiasi altra info rilevante"
}

${caption ? `DIDASCALIA UTENTE: "${caption}"` : ''}

REGOLE:
- Se non riesci a leggere un campo, metti null
- P.IVA: rimuovi prefisso "IT", deve essere 11 cifre
- Importi: usa il punto come separatore decimale
- Data: converti sempre in YYYY-MM-DD
- Se è un DDT (documento di trasporto), rispondi con tipo_documento: "ddt"
- ddt_riferimento: array di stringhe o null se non presente
- Rispondi SOLO con JSON valido, senza markdown e senza backtick`;

  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    { inline_data: { mime_type: media.mimeType, data: media.base64 } },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  console.log("🧾 estraiFatturaFoto: avvio estrazione precisa...");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("🔥 Errore Gemini estraiFatturaFoto:", err);
    throw new Error(`Errore API Gemini: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error("Risposta vuota da Gemini");

  const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
  console.log("✅ estraiFatturaFoto completato");

  return JSON.parse(cleanJson) as FatturaEstratta;
}

// ============================================================
// SECONDA CHIAMATA: Sintesi con dati reali (RAG budget)
// ============================================================

export async function synthesizeWithData(
  originalQuestion: string,
  dbContext: string
): Promise<GeminiResponse> {
  const prompt = `Sei un assistente edile amministrativo. L'utente ha chiesto informazioni e il sistema ha trovato i dati nel database.

DOMANDA ORIGINALE: "${originalQuestion}"

${dbContext}

REGOLE PER LA RISPOSTA:
- Se l'utente chiede "budget", "quanto manca", "costi": parla del Residuo Budget Costi
- Se l'utente chiede "margine", "guadagno", "utile": parla del Margine Utile (Valore Vendita - Speso)
- Se chiede genericamente "come andiamo": dai entrambi i dati
- Se il budget costi è quasi esaurito (>85%), segnalalo con attenzione
- Se il margine è negativo, segnalalo come ALLARME
- Usa SOLO i numeri dal database, NON inventare
- Rispondi in italiano, breve e professionale per WhatsApp

Rispondi SOLO in JSON valido (no markdown, no backtick):
{"category":"budget","search_key":null,"summary":"Riepilogo dati","reply_to_user":"Risposta WhatsApp con dati reali"}`;

  return await callGemini([{ text: prompt }], false);
}

// ============================================================
// HELPER: Riconosce se un messaggio è una conferma "sì" o "no"
// Usato dalla macchina a stati in route.ts
// Non chiama Gemini — è una regex locale (più veloce e affidabile)
// ============================================================

export function detectConfirmation(text: string): "yes" | "no" | null {
  const cleaned = text.trim().toLowerCase();

  // Conferme positive
  if (/^(s[iì]|si|ok|conferm[oa]|va bene|esatto|corretto|procedi|fatto|yes)$/i.test(cleaned)) {
    return "yes";
  }

  // Conferme negative
  if (/^(no|annulla|cancel|sbagliato|errato|non va|stop)$/i.test(cleaned)) {
    return "no";
  }

  return null;
}

// ============================================================
// ENGINE: Chiamata HTTP a Gemini (condivisa tra le funzioni)
// ============================================================

async function callGemini(
  parts: Array<Record<string, unknown>>,
  hasImage: boolean
): Promise<GeminiResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return fallbackError("Errore configurazione Server");

  const modelToUse = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  try {
    console.log(`🤖 Chiamata Gemini ${modelToUse} (immagine: ${hasImage ? "SI" : "NO"})...`);

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] }),
      });

      if (response.status === 503 && attempt < maxRetries) {
        const waitMs = attempt * 3000;
        console.warn(`⏳ Gemini 503 (tentativo ${attempt}/${maxRetries}), retry tra ${waitMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`🔥 Errore API ${modelToUse}:`, JSON.stringify(errorData, null, 2));
        throw new Error(`Errore API: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!aiText) throw new Error("Risposta vuota da Gemini");

      const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
      console.log("✅ Gemini ha risposto!");

      return JSON.parse(cleanJson);
    }

    throw lastError || new Error("Gemini non disponibile dopo i tentativi");
  } catch (error) {
    console.error("🔥 Errore Gemini:", error);
    return fallbackError(
      hasImage
        ? "Non sono riuscito ad analizzare questa immagine. Riprova o descrivi il contenuto a parole."
        : "I miei sistemi AI sono temporaneamente offline. Riprova tra poco."
    );
  }
}

function fallbackError(msg: string): GeminiResponse {
  return { category: "errore", summary: "Errore AI", reply_to_user: msg };
}

// ============================================================
// PARSER DOCUMENTI PERSONALE
// Analizza contratti, visite mediche e corsi di sicurezza.
// Usa RAG: incrocia livello CCNL estratto con parametri_globali
// per calcolare costo_orario_reale_stimato.
// ============================================================

export async function parseDocumentoPersonale(
  media: MediaInput,
  categoria: "contratto" | "visita_medica" | "corso_sicurezza" | "altro",
  parametriGlobali?: {
    aliquote_ccnl?: {
      inps: number;
      inail: number;
      edilcassa: number;
      tfr: number;
      ferie_permessi: number;
      livelli: Record<string, { paga_base: number; label: string }>;
    };
  } | null
): Promise<DatiEstrattiDocumento> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const isContratto = categoria === "contratto";

  // --- Costruisci contesto RAG per i contratti ---
  let ragContext = "";
  if (isContratto && parametriGlobali?.aliquote_ccnl) {
    const a = parametriGlobali.aliquote_ccnl;
    const livelliStr = Object.entries(a.livelli)
      .map(([k, v]) => `  Livello ${k}: paga base €${v.paga_base}/h (${v.label})`)
      .join("\n");
    ragContext = `
TABELLA CCNL EDILIZIA (da Knowledge Base):
${livelliStr}
Aliquote contributive:
  INPS: ${(a.inps * 100).toFixed(2)}%
  INAIL: ${(a.inail * 100).toFixed(2)}%
  Edilcassa: ${(a.edilcassa * 100).toFixed(2)}%
  TFR: ${(a.tfr * 100).toFixed(2)}%
  Ferie/Permessi: ${(a.ferie_permessi * 100).toFixed(2)}%

FORMULA costo_orario_reale = paga_base × (1 + INPS + INAIL + Edilcassa + TFR + Ferie)
`;
  }

  const prompt = isContratto
    ? `Sei un esperto di contratti di lavoro edile italiano. Analizza questo documento e estrai i dati con un punteggio di confidenza (0.0-1.0).

${ragContext}

ISTRUZIONI:
1. Estrai tutti i campi richiesti dal documento
2. Per ogni campo indica: value (valore estratto o null), confidence (0.0-1.0), raw_text (testo grezzo trovato)
3. Se trovi il livello CCNL, usa la tabella sopra per calcolare costo_orario_reale_stimato
4. Se non trovi un campo, metti value: null e confidence: 0.0

Rispondi SOLO con JSON valido (no markdown, no backtick):
{
  "nome_dipendente":         {"value": "...", "confidence": 0.95, "raw_text": "..."},
  "livello_ccnl":            {"value": "3", "confidence": 0.90, "raw_text": "..."},
  "paga_base_oraria":        {"value": 11.20, "confidence": 0.85, "raw_text": "..."},
  "ore_settimanali":         {"value": 40, "confidence": 0.95, "raw_text": "..."},
  "data_assunzione":         {"value": "2024-01-15", "confidence": 0.90, "raw_text": "..."},
  "data_scadenza_contratto": {"value": null, "confidence": 0.0, "raw_text": ""},
  "tipo_contratto":          {"value": "indeterminato", "confidence": 0.95, "raw_text": "..."},
  "costo_orario_reale_stimato": 16.45
}`
    : `Sei un esperto di documenti sanitari e sicurezza sul lavoro. Analizza questo documento e estrai i dati con un punteggio di confidenza (0.0-1.0).

ISTRUZIONI:
1. Estrai tutti i campi richiesti dal documento
2. Per ogni campo indica: value (valore estratto o null), confidence (0.0-1.0), raw_text (testo grezzo trovato)
3. tipo_documento può essere: "visita_medica", "corso_sicurezza", "altro"
4. esito può essere: "idoneo", "idoneo_con_limitazioni", "non_idoneo", null

Rispondi SOLO con JSON valido (no markdown, no backtick):
{
  "nome_dipendente":  {"value": "...", "confidence": 0.95, "raw_text": "..."},
  "tipo_documento":   {"value": "visita_medica", "confidence": 0.90, "raw_text": "..."},
  "data_emissione":   {"value": "2024-03-10", "confidence": 0.95, "raw_text": "..."},
  "data_scadenza":    {"value": "2026-03-10", "confidence": 0.90, "raw_text": "..."},
  "esito":            {"value": "idoneo", "confidence": 0.95, "raw_text": "..."},
  "ente_emittente":   {"value": "...", "confidence": 0.80, "raw_text": "..."},
  "note":             {"value": null, "confidence": 0.0, "raw_text": ""}
}`;

  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    {
      inline_data: {
        mime_type: media.mimeType,
        data: media.base64,
      },
    },
  ];

  const modelToUse = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  console.log(`🤖 parseDocumentoPersonale: categoria=${categoria}, modello=${modelToUse}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("🔥 Errore Gemini parseDocumento:", err);
    throw new Error(`Errore API Gemini: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error("Risposta vuota da Gemini");

  const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
  console.log("✅ parseDocumentoPersonale completato");

  return JSON.parse(cleanJson) as DatiEstrattiDocumento;
}

// ============================================================
// PREVENTIVAZIONE INTELLIGENCE: RAG Semantic Matching
// Modulo per la stima dei costi tramite prezziario e storico
// ============================================================

export interface PreventivoMatchResult {
  ai_prezzo_stimato: number | null;
  ai_prezzo_min: number | null;
  ai_prezzo_max: number | null;
  ai_confidence_score: number; // 0.0 - 1.0
  ai_match_id: string | null;  // UUID della voce dal prezziario ufficiale
  ragionamento: string;        // Spiegazione per la Human Validation
}

export async function matchSemanticoPrezziario(
  descrizioneLavorazione: string,
  unitaMisura: string | null,
  ragContextPrezziario: string, // Voci dal DB passate come stringa
  ragContextStorico: string     // Costi passati dal DB passati come stringa
): Promise<PreventivoMatchResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const prompt = `Sei un ingegnere edile italiano esperto in computi metrici e preventivazione.
Il tuo compito è analizzare la descrizione di una singola lavorazione da preventivare e confrontarla semanticamente con il prezziario ufficiale 2025 ed eventualmente con lo storico aziendale.

LAVORAZIONE DA PREVENTIVARE:
- Descrizione: "${descrizioneLavorazione}"
- Unità di Misura: ${unitaMisura || "Non specificata"}

KNOWLEDGE BASE (Prezziario Ufficiale 2025):
${ragContextPrezziario || "Nessuna voce fornita."}

KNOWLEDGE BASE (Storico Costi Aziendali):
${ragContextStorico || "Nessun dato storico fornito."}

ISTRUZIONI:
1. Trova la voce del prezziario più simile alla lavorazione richiesta (seleziona l'ID esatto).
2. Usa il prezzo ufficiale e modificalo in base allo storico aziendale per stimare il costo reale.
3. Definisci: "ai_prezzo_stimato" (il più probabile), "ai_prezzo_min" e "ai_prezzo_max".
4. Definisci il "ai_confidence_score" (0.0 a 1.0):
   - 0.95: Match esatto di descrizione e unità di misura.
   - 0.60-0.80: Match parziale (es. cambia lo spessore o il materiale è simile ma non identico).
   - < 0.50: Match debole, suggerito solo per associazione logica.
   - 0.0: Nessun match possibile (restituisci null per i prezzi).

Rispondi SOLO con un JSON valido (no markdown, no backtick), con questa esatta struttura:
{
  "ai_prezzo_stimato": 150.50,
  "ai_prezzo_min": 140.00,
  "ai_prezzo_max": 165.00,
  "ai_confidence_score": 0.85,
  "ai_match_id": "uuid-della-voce-selezionata",
  "ragionamento": "Breve motivazione della stima e delle differenze rispetto al prezziario ufficiale..."
}`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  const modelToUse = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  console.log(`🤖 matchSemanticoPrezziario: Avvio RAG per lavorazione...`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("🔥 Errore Gemini matchSemantico:", err);
    throw new Error(`Errore API Gemini: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error("Risposta vuota da Gemini");

  const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
  console.log("✅ matchSemanticoPrezziario completato");

  return JSON.parse(cleanJson) as PreventivoMatchResult;
}

// ============================================================
// ARCHIVIO CANTIERE: Analisi Documenti e Scadenze (Smart Expiry)
// Estrae tipo documento, categoria e data di scadenza da PDF/Immagini
// ============================================================

export interface DocumentoCantiereParsed {
  tipo_documento: string;        // es. POS, Libretto Gru, Corso Sicurezza
  data_scadenza: string | null;  // YYYY-MM-DD
  categoria_suggerita: string;   // Sicurezza_POS_PSC, Manutenzione_Mezzi, Personale, DDT_Fatture, Foto, Altro
  confidence: number;            // 0.0-1.0
  note_estratte: string;         // Info aggiuntive
}

export async function parseDocumentoCantiere(
  media: MediaInput
): Promise<DocumentoCantiereParsed> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const prompt = `Sei un assistente per la sicurezza e gestione cantieri edili in Italia.
Analizza il documento fornito (può essere un'immagine o la prima pagina di un PDF).
Il tuo obiettivo è estrarre le informazioni chiave per l'archivio del cantiere.

ISTRUZIONI:
1. Identifica il 'tipo_documento' (es. "POS", "PSC", "DURC", "Libretto Macchina", "Fattura Fornitore").
2. Cerca una 'data_scadenza' (validità, scadenza revisione, fine validità). Restituisci nel formato YYYY-MM-DD. Se non c'è, restituisci null.
3. Suggerisci la 'categoria_suggerita' scegliendo ESATTAMENTE tra una di queste stringhe: 
   - "Sicurezza_POS_PSC"
   - "Manutenzione_Mezzi"
   - "Personale"
   - "DDT_Fatture"
   - "Foto"
   - "Altro"
4. Valuta la 'confidence' (da 0.0 a 1.0) della tua analisi.
5. In 'note_estratte' inserisci eventuali dati rilevanti (es. targa del mezzo, nome ditta esterna).

Rispondi SOLO con JSON valido, senza markdown e senza backtick, usando questa struttura esatta:
{
  "tipo_documento": "Piano Operativo di Sicurezza (POS)",
  "data_scadenza": "2026-12-31",
  "categoria_suggerita": "Sicurezza_POS_PSC",
  "confidence": 0.95,
  "note_estratte": "Ditta subappaltatrice: EdilRossi Srl"
}`;

  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    {
      inline_data: {
        mime_type: media.mimeType,
        data: media.base64,
      },
    },
  ];

  const modelToUse = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  console.log(`🤖 parseDocumentoCantiere: avvio analisi...`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("🔥 Errore Gemini parseDocumentoCantiere:", err);
    throw new Error(`Errore API Gemini: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!aiText) throw new Error("Risposta vuota da Gemini");

  const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
  console.log("✅ parseDocumentoCantiere completato");

  return JSON.parse(cleanJson) as DocumentoCantiereParsed;
}

export async function parseComputoFoto(media: { base64: string; mimeType: string }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const prompt = `Analizza questa foto di un computo metrico o preventivo edilizio. 
Estrai i dati in una tabella JSON. Se mancano i prezzi, lascia null. 
Rispondi SOLO con il JSON, senza markdown.
Formato: { "righe": [{ "codice": "string", "descrizione": "string", "unita_misura": "string", "quantita": number, "prezzo_unitario": number | null }] }`;

  const parts = [
    { text: prompt }, 
    { inline_data: { mime_type: media.mimeType, data: media.base64 } }
  ];
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!response.ok) throw new Error("Errore chiamata Gemini Vision");

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleanJson = text.replace(/```json|```/g, "").trim();
  
  return JSON.parse(cleanJson);
}

// ============================================================================
// STEP 5 / FIX 3: RICONCILIAZIONE BANCARIA AI (COMPATTA E VELOCE)
// ============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';

// AGGIUNTO IL PARAMETRO OPZIONALE "soggetti" (come da piano precedente, casomai servisse)
export async function matchBatchRiconciliazioneBancaria(movimenti: any[], scadenzeAperte: any[], soggetti: any[] = []) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GOOGLE_API_KEY mancante.");
    return movimenti.map(m => ({ movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0, motivo: "API Key mancante" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    // Fix 5A: Aggiunto thinkingConfig se supportato dalla SDK per limitare il tempo di pensiero
    generationConfig: { 
      responseMimeType: "application/json",
      // @ts-ignore - nel caso i tipi della SDK non siano aggiornatissimi
      thinkingConfig: { thinkingBudget: 1024 } 
    }
  });

  // FIX 1A: Comprimere i dati delle scadenze aperte
  const scadenzeCompatte = scadenzeAperte.map(s => ({
    i: s.id,
    si: s.soggetto_id,
    n: (s.anagrafica_soggetti as any)?.ragione_sociale || '',
    r: Math.round((Number(s.importo_totale) - Number(s.importo_pagato || 0)) * 100) / 100,
    f: s.fattura_riferimento || '',
    t: s.tipo === 'uscita' ? 'U' : 'E'
  }));

  // FIX 1B: Comprimere i dati dei movimenti + includi campi XML strutturati
  const movimentiCompatti = movimenti.map(m => ({
    i: m.id,
    imp: m.importo,
    c: (m.descrizione || '').substring(0, 200), // Causale testuale (max 200 chars)
    xn: m.xml_nome_controparte || null,          // Nome controparte da XML (più affidabile del testo)
    xi: m.xml_iban_controparte || null,          // IBAN controparte da XML
    xp: m.xml_piva_controparte || null           // P.IVA controparte da XML
  }));

  // FIX 1C e 5B: Comprimere le istruzioni e imporre velocità
  // NIENTE null, 2 nei JSON.stringify per massimizzare la compressione
  const prompt = `IMPORTANTE: Rispondi VELOCEMENTE. Non elaborare a lungo. Se non trovi match immediato, metti null.
Associa movimenti bancari ai fornitori/clienti (estratti da XML CBI). Rispondi SOLO in JSON.

MOVIMENTI:
${JSON.stringify(movimentiCompatti)}

SCADENZE APERTE (i=id, si=soggetto_id, n=nome, r=residuo€, f=fattura, t=U/E):
${JSON.stringify(scadenzeCompatte)}

ANAGRAFICA SOGGETTI (id, nome):
${JSON.stringify(soggetti.map(s => ({ id: s.id, n: s.ragione_sociale })))}

REGOLE:
- Ignora codici CBI (es. "SDD Core", "CBILL", "2601C240477").
- Cerca nome fornitore/cliente nella causale (ignora Srl/SpA, case-insensitive). Supera differenze come "Italia" vs "Italy".
- Cerca numero fattura (FT/FATT + numero).
- Confronta importo movimento con residuo scadenza.
- La data del movimento puo' essere diversa dalla data_scadenza: NON escludere il match solo per differenze di data.
- confidence: 0.95+ se fattura/importo esatto, 0.70-0.94 se solo nome, <0.40 se niente.

RISPONDI ESCLUSIVAMENTE con array JSON:
[{
  "movimento_id": "uuid",
  "scadenza_id": "uuid_o_null",
  "soggetto_id": "uuid_o_null",
  "confidence": 0.95,
  "motivo": "breve"
}]`;

  // FIX 3: Logging CRITICO per il prompt in andata
  const promptSize = prompt.length;
  const tokenEstimate = Math.round(promptSize / 4);
  console.log(`📏 PROMPT AI: ${promptSize} chars (~${tokenEstimate} token). Movimenti: ${movimenti.length}, Scadenze passate: ${scadenzeCompatte.length}`);

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const endTime = Date.now();
    
    let textInfo = result.response.text();
    textInfo = textInfo.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // FIX 3: Logging CRITICO per la risposta
    const responseSize = textInfo.length;
    console.log(`📤 RISPOSTA AI: ${responseSize} chars. Parsing completato in ${((endTime - startTime)/1000).toFixed(1)}s.`);
    
    return JSON.parse(textInfo);
  } catch (error) {
    console.error("❌ Errore Gemini Batch Matching:", error);
    return movimenti.map(m => ({
      movimento_id: m.id, scadenza_id: null, soggetto_id: null,
      confidence: 0, motivo: "Errore AI: " + (error as any)?.message?.substring(0, 100)
    }));
  }
}

// --- STEP 2.6: ESTRAZIONE SALDO DA PDF ESTRATTO CONTO ---

export interface DatiEstrattoConto {
  saldo_finale: number | null;
  data_riferimento: string | null;
  note: string | null;
}

export async function estraiSaldoPDFEstrattoConto(pdfBase64: string, mimeType: string = "application/pdf"): Promise<DatiEstrattoConto> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY mancante");

  const prompt = `Analizza questo documento che rappresenta un estratto conto bancario.
Il tuo unico obiettivo è estrarre due dati cruciali per allineare la liquidità aziendale:
1. "saldo_finale": Cerca diciture come "Saldo Contabile Finale", "Saldo al", "Nuovo Saldo". Estrai l'importo numerico (es. 15400.50).
2. "data_riferimento": La data a cui si riferisce il saldo finale estratto, convertita nel formato YYYY-MM-DD.

Rispondi SOLO in JSON valido senza markdown, con la struttura:
{
  "saldo_finale": 15000.50,
  "data_riferimento": "2026-01-31",
  "note": "Breve nota su dove hai trovato il dato (es. 'Trovato a pagina 1 sotto Saldo Finale')"
}`;

  const parts = [
    { text: prompt }, 
    { inline_data: { mime_type: mimeType, data: pdfBase64 } }
  ];
  
  // RIGORE: Anche qui standardizziamo su gemini-2.5-flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!response.ok) throw new Error(`Errore API Gemini Vision: ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanJson = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    return JSON.parse(cleanJson) as DatiEstrattoConto;
  } catch (error) {
    console.error("🔥 Errore estrazione saldo PDF:", error);
    return { saldo_finale: null, data_riferimento: null, note: "Fallimento nell'estrazione OCR del documento." };
  }
}