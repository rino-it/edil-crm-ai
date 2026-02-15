export async function processWithGemini(text: string, imageUrl?: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ MANCA LA GOOGLE_API_KEY SU VERCEL!");
    return fallbackError("Errore configurazione Server (Manca Key)");
  }

  // Usiamo direttamente l'URL REST API (senza libreria SDK)
  // Questo bypassa qualsiasi problema di versione del pacchetto npm
  const model = "gemini-1.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    console.log(`🤖 Chiamata REST diretta a Gemini (${model})...`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      // Se c'è un errore, leggiamo il messaggio VERO di Google
      const errorData = await response.json();
      console.error("🔥 ERRORE GOOGLE API:", JSON.stringify(errorData, null, 2));
      throw new Error(`Errore API: ${response.status}`);
    }

    const data = await response.json();
    
    // Estrazione risposta
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) throw new Error("Risposta vuota da Gemini");

    // Pulizia JSON
    const cleanJson = aiText.replace(/```json|```/g, '').trim();
    console.log("✅ Gemini ha risposto!");
    
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("🔥 Errore Fetch:", error);
    return fallbackError("I miei sistemi AI sono temporaneamente offline.");
  }
}

// Funzione di supporto per errore standard
function fallbackError(msg: string) {
  return {
    category: "errore",
    summary: "Errore Sistema",
    reply_to_user: msg
  };
}