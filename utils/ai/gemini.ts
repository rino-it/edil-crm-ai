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
  category: "materiale" | "presenze" | "problema" | "budget" | "ddt" | "preventivo" | "altro" | "errore";
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

interface MediaInput {
  base64: string;
  mimeType: string;
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

⚠️ PRIORITÀ ESTRAZIONE DATI (DALLA FOTO):
1. **NUMERO DOCUMENTO (DDT)**: Cerca in alto a destra o sinistra. Cerca etichette come "DDT n.", "Doc n.", "Numero". È CRUCIALE per la riconciliazione automatica con le fatture. Se è scritto a mano, fai del tuo meglio per decifrarlo.
2. **FORNITORE**: Cerca il logo o l'intestazione in alto.
3. **DATA**: Data del documento (formato YYYY-MM-DD).
4. **MATERIALI**: Elenco breve dei materiali consegnati.
5. **CANTIERE**: Cerca l'indirizzo di destinazione ("Luogo di destinazione") per capire il cantiere.
6. **IMPORTO**: Se c'è un totale visibile (es. 1500.50), estrailo. Altrimenti metti 0.

Rispondi SOLO con un JSON valido, senza markdown e senza backtick:
{"category":"ddt","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"fornitore":"...","data":"YYYY-MM-DD","importo":0,"materiali":"...","numero_ddt":"12345","cantiere_rilevato":"...oppure null"}}`
    
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

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

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
// STEP 5: RICONCILIAZIONE BANCARIA AI
// ============================================================================

// Importiamo esplicitamente l'SDK per assicurarci che sia disponibile
import { GoogleGenerativeAI } from '@google/generative-ai';

// utils/ai/gemini.ts

export async function matchBatchRiconciliazioneBancaria(movimenti: any[], scadenzeAperte: any[]) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ API Key GOOGLE_API_KEY mancante.");
    return movimenti.map(m => ({ movimento_id: m.id, scadenza_id: null, confidence: 0, motivo: "API Key mancante" }));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `
Sei un software avanzato di riconciliazione bancaria per un'impresa edile.
Devi trovare la fattura/scadenza corretta per ogni movimento bancario fornito nell'elenco.

ELENCO MOVIMENTI BANCA DA RICONCILIARE:
${JSON.stringify(movimenti.map(m => ({ id: m.id, data: m.data_operazione, importo: m.importo, causale: m.descrizione })), null, 2)}

SCADENZE APERTE DISPONIBILI (Fatture attive e passive):
${JSON.stringify(scadenzeAperte.map(s => ({
    id: s.id,
    soggetto: s.anagrafica_soggetti?.ragione_sociale || 'N/D',
    importo_residuo: Number(s.importo_totale) - Number(s.importo_pagato || 0),
    data_scadenza: s.data_scadenza,
    riferimento: s.fattura_riferimento,
    tipo: s.tipo
})), null, 2)}

REGOLE DI MATCHING:
1. MATCH ESATTO (>0.90): Importo identico (segno opposto) E nome soggetto/fattura presente nella causale.
2. MATCH FUZZY (0.60-0.89): Importo compatibile (acconto o piccole differenze) E data vicina o parole chiave correlate.
3. MATCH DEBOLE (<0.60): Solo l'importo coincide, causale generica.
4. NESSUN MATCH: Se non c'è corrispondenza logica.

Rispondi ESCLUSIVAMENTE con un array di oggetti JSON con questa struttura:
[{
  "movimento_id": "id_del_movimento",
  "scadenza_id": "id_scadenza_trovata_o_null",
  "confidence": 0.95,
  "motivo": "Spiegazione breve"
}]
`;

  try {
    const result = await model.generateContent(prompt);
    let textInfo = result.response.text();
    
    // RIGORE: Rimuoviamo il markdown prima di passare il testo al parser
    textInfo = textInfo.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    return JSON.parse(textInfo);
  } catch (error) {
    console.error("❌ Errore Gemini Batch Matching:", error);
    return movimenti.map(m => ({ 
      movimento_id: m.id, 
      scadenza_id: null, 
      confidence: 0, 
      motivo: "Errore nel parsing AI." 
    }));
  }
}