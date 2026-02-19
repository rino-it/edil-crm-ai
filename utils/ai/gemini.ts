// ============================================================
// GEMINI 2.5 FLASH - Analisi testo + immagini (multimodale)
// Nota: Nel nostro ambiente i modelli 1.5 restituiscono 404.
// Usiamo gemini-2.5-flash confermato attivo dalla diagnostica.
//
// Funzioni:
//   processWithGemini()       - Analisi principale (testo/foto)
//   synthesizeWithData()      - Seconda chiamata con dati reali (RAG)
//   parseDocumentoPersonale() - Parser AI documenti HR (contratto, visita, corso)
// ============================================================

// ============================================================
// INTERFACCE PER DOCUMENTI PERSONALE
// ============================================================

export interface ConfidenceField {
  valore: string | number | null;
  confidence: "high" | "medium" | "low";
  nota?: string;
}

export interface DatiEstrattiContratto {
  livello_inquadramento: ConfidenceField;
  paga_base_lorda: ConfidenceField;       // € mensile o oraria
  paga_base_tipo: ConfidenceField;        // "mensile" | "oraria"
  coefficiente_straordinari: ConfidenceField;
  condizioni_trasferta: ConfidenceField;
  ccnl_applicato: ConfidenceField;
  data_assunzione: ConfidenceField;
  data_scadenza: ConfidenceField;         // null se indeterminato
  // Dati inferiti via RAG da parametri_globali
  aliquota_inps: ConfidenceField;
  aliquota_inail: ConfidenceField;
  aliquota_edilcassa: ConfidenceField;
  tfr: ConfidenceField;
  incidenza_ferie: ConfidenceField;
  costo_orario_reale_stimato: ConfidenceField; // calcolato dal sistema
}

export interface DatiEstrattiDocumentoSanitario {
  nominativo: ConfidenceField;
  esito_o_tipo_corso: ConfidenceField;
  data_effettuazione: ConfidenceField;
  data_scadenza: ConfidenceField;
  medico_o_ente: ConfidenceField;
  note: ConfidenceField;
}

export type CategoriaDocumento = "contratto" | "visita_medica" | "corso_sicurezza";

export interface ParseDocumentoResult {
  categoria: CategoriaDocumento;
  dati_estratti: DatiEstrattiContratto | DatiEstrattiDocumentoSanitario;
  riepilogo_ai: string;
  campi_da_verificare: string[]; // Lista campi con confidence bassa
}

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
// PARSER DOCUMENTI PERSONALE: OCR + Estrazione strutturata
// Differenziato per categoria (contratto / visita / corso)
// Con RAG: incrocia livello estratto con parametri_globali
// ============================================================

export async function parseDocumentoPersonale(
  media: { base64: string; mimeType: string },
  categoria: CategoriaDocumento,
  parametriGlobali: Record<string, unknown> | null
): Promise<ParseDocumentoResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return buildParseError(categoria, "GOOGLE_API_KEY mancante");
  }

  let prompt = "";

  if (categoria === "contratto") {
    const livelli = parametriGlobali?.ccnl_edilizia_livelli
      ? JSON.stringify(parametriGlobali.ccnl_edilizia_livelli, null, 2)
      : "Non disponibile";

    prompt = `Sei un esperto di contratti di lavoro nell'edilizia italiana. Analizza questa immagine di un contratto di assunzione ed estrai i dati richiesti.

LIVELLI CCNL EDILZIIA DISPONIBILI (Knowledge Base aziendale):
${livelli}

ISTRUZIONI DI ESTRAZIONE:
1. Identifica il LIVELLO DI INQUADRAMENTO (es. "2", "3", "Operaio qualificato").
2. Individua la PAGA BASE LORDA (mensile o oraria).
3. Cerca il COEFFICIENTE STRAORDINARI (es. 1.25, 25%, "maggiorazione del 25%").
4. Cerca CONDIZIONI TRASFERTA (es. indennità, rimborso km, se prevista).
5. Identifica il CCNL applicato e la DATA DI ASSUNZIONE.
6. Cerca la DATA DI SCADENZA (per contratti a termine, null se indeterminato).

LOGICA RAG: Usa il livello estratto per ricavare aliquote INPS, INAIL, Edilcassa, TFR e incidenza ferie dalla Knowledge Base sopra.
Se il livello non corrisponde esattamente, usa il più vicino e segna confidence="low".

PER OGNI CAMPO usa questo formato:
{"valore": <valore_estratto_o_null>, "confidence": "high"|"medium"|"low", "nota": "spiegazione opzionale"}

- "high" = dato leggibile e certo nel documento
- "medium" = dato dedotto o parzialmente leggibile
- "low" = dato assente o inferito da fonti esterne (es. aliquote da tabella CCNL)

Rispondi SOLO con JSON valido (no markdown, no backtick):
{
  "livello_inquadramento": {"valore": "...", "confidence": "..."},
  "paga_base_lorda": {"valore": 0, "confidence": "..."},
  "paga_base_tipo": {"valore": "mensile", "confidence": "..."},
  "coefficiente_straordinari": {"valore": 1.25, "confidence": "..."},
  "condizioni_trasferta": {"valore": "...", "confidence": "..."},
  "ccnl_applicato": {"valore": "...", "confidence": "..."},
  "data_assunzione": {"valore": "YYYY-MM-DD", "confidence": "..."},
  "data_scadenza": {"valore": null, "confidence": "high", "nota": "Contratto indeterminato"},
  "aliquota_inps": {"valore": 0.2315, "confidence": "low", "nota": "Da tabella CCNL livello X"},
  "aliquota_inail": {"valore": 0.030, "confidence": "low", "nota": "Da tabella CCNL livello X"},
  "aliquota_edilcassa": {"valore": 0.020, "confidence": "low", "nota": "Da tabella CCNL livello X"},
  "tfr": {"valore": 0.0741, "confidence": "high", "nota": "Fisso per legge"},
  "incidenza_ferie": {"valore": 0.1082, "confidence": "medium", "nota": "Da CCNL"},
  "costo_orario_reale_stimato": {"valore": 0, "confidence": "low", "nota": "Calcolato dal sistema dopo validazione"}
}`;
  } else {
    // visita_medica o corso_sicurezza
    const tipoDoc = categoria === "visita_medica"
      ? "certificato di idoneità lavorativa / visita medica"
      : "attestato di formazione / corso sicurezza";

    prompt = `Sei un esperto di documenti HR nell'edilizia. Analizza questa immagine di ${tipoDoc} ed estrai i dati richiesti.

ISTRUZIONI DI ESTRAZIONE:
1. NOMINATIVO del lavoratore (nome e cognome).
2. ESITO o TIPO CORSO (es. "Idoneo alla mansione", "Corso Antincendio Rischio Alto", "Primo Soccorso").
3. DATA DI EFFETTUAZIONE del documento/corso.
4. DATA DI SCADENZA della validità (es. visita valida 1 anno, corso valido 5 anni).
5. MEDICO o ENTE che ha rilasciato il documento.
6. NOTE aggiuntive rilevanti.

PER OGNI CAMPO usa questo formato:
{"valore": <valore_o_null>, "confidence": "high"|"medium"|"low", "nota": "opzionale"}

Rispondi SOLO con JSON valido (no markdown, no backtick):
{
  "nominativo": {"valore": "...", "confidence": "..."},
  "esito_o_tipo_corso": {"valore": "...", "confidence": "..."},
  "data_effettuazione": {"valore": "YYYY-MM-DD", "confidence": "..."},
  "data_scadenza": {"valore": "YYYY-MM-DD", "confidence": "..."},
  "medico_o_ente": {"valore": "...", "confidence": "..."},
  "note": {"valore": null, "confidence": "high"}
}`;
  }

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: media.mimeType, data: media.base64 } },
  ];

  try {
    const modelToUse = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("❌ Gemini parse documento error:", err);
      return buildParseError(categoria, `API error ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) return buildParseError(categoria, "Risposta vuota");

    const cleanJson = aiText.replace(/```json\s*|```\s*/g, "").trim();
    const datiEstrattiRaw = JSON.parse(cleanJson);

    // Se contratto: calcola costo orario stimato
    if (categoria === "contratto") {
      const dati = datiEstrattiRaw as DatiEstrattiContratto;
      const pagaBaseVal = typeof dati.paga_base_lorda?.valore === "number"
        ? dati.paga_base_lorda.valore
        : parseFloat(String(dati.paga_base_lorda?.valore || "0"));
      const pagaTipo = dati.paga_base_tipo?.valore;

      // Converti in orario se mensile (media 173h/mese per edilizia)
      const pagaOraria = pagaTipo === "mensile" ? pagaBaseVal / 173 : pagaBaseVal;

      const inps = typeof dati.aliquota_inps?.valore === "number" ? dati.aliquota_inps.valore : 0.2315;
      const inail = typeof dati.aliquota_inail?.valore === "number" ? dati.aliquota_inail.valore : 0.030;
      const edilcassa = typeof dati.aliquota_edilcassa?.valore === "number" ? dati.aliquota_edilcassa.valore : 0.020;
      const tfr = 0.0741;
      const ferie = typeof dati.incidenza_ferie?.valore === "number" ? dati.incidenza_ferie.valore : 0.1082;

      // Formula: Paga Oraria * (1 + INPS + INAIL + Edilcassa + TFR + Ferie)
      const costoReale = pagaOraria * (1 + inps + inail + edilcassa + tfr + ferie);

      dati.costo_orario_reale_stimato = {
        valore: Math.round(costoReale * 100) / 100,
        confidence: pagaOraria > 0 ? "medium" : "low",
        nota: `Calcolato: ${pagaOraria.toFixed(2)}€/h × (1 + ${inps} + ${inail} + ${edilcassa} + ${tfr} + ${ferie})`,
      };
    }

    // Identifica campi con confidence bassa
    const campiDaVerificare: string[] = [];
    for (const [campo, info] of Object.entries(datiEstrattiRaw)) {
      const fieldInfo = info as ConfidenceField;
      if (fieldInfo?.confidence === "low" || fieldInfo?.confidence === "medium") {
        campiDaVerificare.push(campo);
      }
    }

    return {
      categoria,
      dati_estratti: datiEstrattiRaw,
      riepilogo_ai: `Documento ${categoria} analizzato. ${campiDaVerificare.length} campo/i da verificare.`,
      campi_da_verificare: campiDaVerificare,
    };
  } catch (err) {
    console.error("🔥 Errore parseDocumentoPersonale:", err);
    return buildParseError(categoria, "Errore di parsing JSON");
  }
}

function buildParseError(categoria: CategoriaDocumento, msg: string): ParseDocumentoResult {
  return {
    categoria,
    dati_estratti: {} as DatiEstrattiContratto,
    riepilogo_ai: `Errore: ${msg}`,
    campi_da_verificare: [],
  };
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