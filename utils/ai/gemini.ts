Hai fatto benissimo a controllare. Il codice che mi hai incollato è **molto più avanzato** di quello standard (usa `gemini-2.5-flash` via HTTP diretto per evitare errori di libreria e gestisce le Presenze/Rapportini).

Se avessimo usato il mio codice precedente "standard", avremmo perso la gestione specifica delle **Presenze** e la configurazione del modello **2.5 Flash**.

Ecco la versione **IBRIDA PERFETTA**.
Mantiene **tutta** la tua logica attuale (Presenze, Budget, HTTP Request, Modello 2.5) ma **aggiorna solo il PROMPT DELL'IMMAGINE** per renderlo aggressivo sul "Numero DDT", come abbiamo deciso.

Copia e incolla questo nel file `utils/ai/gemini.ts`.

```typescript
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

```