import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// LISTA DI MODELLI DA PROVARE (In ordine di preferenza)
const MODELS_TO_TRY = [
  "gemini-1.5-flash",          // Il più veloce e nuovo
  "gemini-1.5-flash-latest",   // Alias alternativo
  "gemini-1.5-flash-001",      // Versione specifica
  "gemini-1.0-pro",            // Versione stabile vecchia
  "gemini-pro"                 // Fallback finale
];

async function tryGenerateWithModel(modelName: string, prompt: string) {
  console.log(`🤖 Tentativo con modello: ${modelName}...`);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

export async function processWithGemini(text: string, imageUrl?: string) {
  const prompt = `
    Sei un assistente esperto per la gestione di cantieri edili.
    Analizza il messaggio del capocantiere.
    MESSAGGIO: "${text}"
    
    Rispondi SOLO con un JSON valido (no markdown) in questo formato:
    {
      "category": "materiale" | "presenze" | "problema" | "budget" | "altro",
      "summary": "Breve riassunto",
      "reply_to_user": "Risposta breve da inviare su WhatsApp"
    }
  `;

  // CICLO "CARRARMATO": Prova i modelli uno alla volta
  for (const modelName of MODELS_TO_TRY) {
    try {
      const jsonString = await tryGenerateWithModel(modelName, prompt);
      
      // Se arriviamo qui, ha funzionato! Puliamo e usciamo.
      const cleanJson = jsonString.replace(/```json|```/g, '').trim();
      console.log(`✅ Successo con il modello: ${modelName}`);
      return JSON.parse(cleanJson);

    } catch (error: any) {
      console.warn(`⚠️ Fallito ${modelName}. Motivo: ${error.message?.split(' ')[0]}`);
      // Continua col prossimo modello nel ciclo...
    }
  }

  // Se siamo qui, hanno fallito TUTTI (drammatico)
  console.error("🔥 TUTTI i modelli Gemini hanno fallito. Controlla la API KEY.");
  return {
    category: "errore",
    summary: "Errore AI totale",
    reply_to_user: "I miei sistemi AI sono temporaneamente non disponibili (Err. Key/Models)."
  };
}