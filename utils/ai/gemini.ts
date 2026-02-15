export async function processWithGemini(text: string, imageUrl?: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ MANCA LA GOOGLE_API_KEY!");
    return fallbackError("Errore configurazione Server");
  }

  // ✅ CORREZIONE: Usiamo un modello presente nella tua lista (2026)
  const modelToUse = "gemini-2.5-flash"; 
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{
      parts: [{
        text: `
          Sei un assistente esperto per la gestione di cantieri edili.
          Analizza il messaggio: "${text}"
          
          Rispondi SOLO JSON (no markdown):
          {
            "category": "materiale" | "presenze" | "problema" | "budget" | "altro",
            "summary": "Breve riassunto",
            "reply_to_user": "Risposta WhatsApp"
          }
        `
      }]
    }]
  };

  try {
    console.log(`🤖 Chiamata Gemini 2.5 Flash...`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`🔥 Errore API ${modelToUse}:`, JSON.stringify(errorData, null, 2));
      throw new Error(`Errore API: ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) throw new Error("Risposta vuota");

    // Pulizia JSON aggressiva (per rimuovere ```json o altri artefatti)
    const cleanJson = aiText.replace(/```json|```/g, '').trim();
    console.log("✅ Gemini ha risposto!");
    
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("🔥 Errore Fetch:", error);
    return fallbackError("I miei sistemi AI sono temporaneamente offline.");
  }
}

function fallbackError(msg: string) {
  return { category: "errore", summary: "Errore", reply_to_user: msg };
}