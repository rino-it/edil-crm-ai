// ============================================================
// GEMINI 2.5 FLASH - Analisi testo + immagini (multimodale)
// Nota: Nel nostro ambiente i modelli 1.5 restituiscono 404.
// Usiamo gemini-2.5-flash confermato attivo dalla diagnostica.
//
// Funzioni:
//   processWithGemini()  - Analisi principale (testo/foto)
//   synthesizeWithData() - Seconda chiamata con dati reali (RAG)
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
  const systemPrompt = hasImage
    ? `Sei un assistente esperto per cantieri edili. Analizzi foto di DDT, fatture e documenti.

MESSAGGIO UTENTE (didascalia foto): "${text}"

ANALISI DOCUMENTO:
1. Se è un DDT o Fattura, estrai TUTTI questi campi:
   - fornitore: nome del fornitore/azienda
   - data: data del documento in formato YYYY-MM-DD
   - importo: importo totale in numero (es. 1500.50). Se non c'è importo visibile, metti 0
   - materiali: elenco breve dei materiali/prodotti
   - numero_ddt: numero del documento se visibile
   - cantiere_rilevato: cerca nella didascalia o nell'indirizzo di consegna un possibile nome di cantiere. Se non trovi nulla metti null

2. Se è una foto generica di cantiere, descrivi cosa vedi.

Rispondi SOLO con un JSON valido, senza markdown e senza backtick:
{"category":"ddt","search_key":null,"summary":"...","reply_to_user":"","extracted_data":{"fornitore":"...","data":"YYYY-MM-DD","importo":0,"materiali":"...","numero_ddt":"...","cantiere_rilevato":"...oppure null"}}`
    : `Sei un assistente per un'impresa edile. Analizza il messaggio e classifica la richiesta.

MESSAGGIO UTENTE: "${text}"

ISTRUZIONI OBBLIGATORIE:
- Se l'utente chiede di BUDGET, SPESE, COSTI, SOLDI, QUANTO MANCA, QUANTO ABBIAMO SPESO di un cantiere, DEVI:
  1. Mettere category = "budget"
  2. Estrarre il NOME DEL CANTIERE e metterlo in search_key (es. "Torre Boldone")
  3. Lasciare reply_to_user come stringa VUOTA ""
- Se l'utente chiede lo stato di TUTTI i cantieri (es. "come siamo messi?"), metti search_key = "__ALL__"
- Per qualsiasi altra richiesta (problemi, presenze, materiali), rispondi direttamente in reply_to_user

ESEMPI:
- "Quanto ci manca di budget su Torre Boldone?" -> category:"budget", search_key:"Torre Boldone", reply_to_user:""
- "Budget villa Almé" -> category:"budget", search_key:"Villa Almé", reply_to_user:""
- "Stato cantieri?" -> category:"budget", search_key:"__ALL__", reply_to_user:""
- "C'è un problema all'impianto" -> category:"problema", search_key:null, reply_to_user:"Descrivi meglio..."

Rispondi SOLO con un JSON valido, senza markdown e senza backtick:
{"category":"...","search_key":"...oppure null","summary":"...","reply_to_user":"...oppure stringa vuota"}`;

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

Usando ESCLUSIVAMENTE i dati qui sopra, genera una risposta WhatsApp:
- Professionale ma concisa
- Includi i numeri esatti dal database
- Se il budget è quasi esaurito (>85%), segnalalo come attenzione
- NON inventare dati che non sono presenti sopra

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
