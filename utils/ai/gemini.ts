import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function processWithGemini(text: string, imageUrl?: string) {
  try {
    // FIX: Usiamo il tag 'latest' che è più robusto per l'API
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // Istruzioni per l'AI (System Prompt)
    const prompt = `
      Sei un assistente esperto per la gestione di cantieri edili.
      Il tuo compito è analizzare i messaggi o le foto inviate dai capicantiere.
      
      OBIETTIVO:
      1. Capire se si tratta di materiale (DDT), presenza operai, o un problema.
      2. Estrarre dati utili (nomi, quantità, date).
      3. Rispondere in modo breve e professionale al capocantiere confermando la ricezione.

      MESSAGGIO UTENTE: "${text}"
      
      Rispondi SOLO con un oggetto JSON (senza markdown) in questo formato:
      {
        "category": "materiale" | "presenze" | "problema" | "budget" | "altro",
        "summary": "Breve riassunto di cosa è successo",
        "reply_to_user": "La risposta da inviare su WhatsApp al capocantiere"
      }
    `;

    // Generazione contenuto
    const result = await model.generateContent(prompt);
    const response = result.response;
    const textResponse = response.text();
    
    // Pulizia JSON (Rimuove eventuali ```json all'inizio/fine)
    const cleanJson = textResponse.replace(/```json|```/g, '').trim();
    
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("Errore Gemini:", error);
    return {
      category: "errore",
      summary: "Errore analisi AI",
      reply_to_user: "Ho ricevuto il messaggio, ma i miei sistemi AI sono momentaneamente offline. Controllo manualmente."
    };
  }
}