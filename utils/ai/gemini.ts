import { GoogleGenerativeAI } from "@google/generative-ai";

// ⚠️ TEST DIRETTO: Incolla la tua chiave qui tra le virgolette
// Esempio: const API_KEY = "AIzaSyDxxxx....";
const API_KEY = "AIzaSyAg8MrYWH1hVyIdMEFeaGhk8-oEI5ldBaU"; 

const genAI = new GoogleGenerativeAI(API_KEY);

export async function processWithGemini(text: string, imageUrl?: string) {
  const prompt = `
    Sei un assistente esperto per la gestione di cantieri edili.
    Analizza il messaggio: "${text}"
    Rispondi SOLO JSON:
    {
      "category": "materiale" | "presenze" | "problema" | "budget" | "altro",
      "summary": "Breve riassunto",
      "reply_to_user": "Risposta WhatsApp"
    }
  `;

  // Usiamo direttamente il modello che DOVREBBE funzionare
  const modelName = "gemini-1.5-flash"; 

  try {
    console.log(`🤖 Test Diretto con chiave hardcoded...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const jsonString = response.text();
    
    const cleanJson = jsonString.replace(/```json|```/g, '').trim();
    console.log(`✅ SUCCESSO! La chiave funziona.`);
    return JSON.parse(cleanJson);

  } catch (error: any) {
    // STAMPIAMO L'ERRORE COMPLETO (Senza tagliarlo)
    console.error("🔥 ERRORE DETTAGLIATO:", JSON.stringify(error, null, 2));
    
    // Se l'errore ha una risposta dal server, stampiamola
    if (error.response) {
        console.error("🔥 Server Response:", error.response);
    }
    
    return {
      category: "errore",
      summary: "Errore API Key",
      reply_to_user: "Errore di configurazione del sistema AI."
    };
  }
}