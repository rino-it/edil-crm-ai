import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// Funzione interna per chiamare l'AI con un modello specifico
async function callAI(modelName: string, prompt: string) {
  console.log(`🤖 Tentativo con modello: ${modelName}`);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

export async function processWithGemini(text: string, imageUrl?: string) {
  // Prompt di sistema (uguale per tutti i modelli)
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

  try {
    let jsonString = "";

    // TENTATIVO 1: Usiamo il modello veloce (Flash)
    try {
      jsonString = await callAI("gemini-1.5-flash", prompt);
    } catch (error: any) {
      console.warn("⚠️ Gemini Flash fallito. Passo al modello di backup...");
      
      // TENTATIVO 2: Usiamo il modello classico (Pro) - La "ruota di scorta"
      // gemini-pro è il modello più stabile e diffuso
      jsonString = await callAI("gemini-pro", prompt);
    }

    // Pulizia della risposta (rimuove ```json e spazi)
    const cleanJson = jsonString.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("🔥 Errore CRITICO Gemini (tutti i modelli falliti):", error);
    return {
      category: "errore",
      summary: "Errore AI totale",
      reply_to_user: "I miei sistemi AI sono temporaneamente non disponibili. Ho notificato l'ufficio."
    };
  }
}