export async function processWithGemini(text: string, imageUrl?: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("❌ MANCA LA GOOGLE_API_KEY!");
    return fallbackError("Errore configurazione Server");
  }

  // 1. Proviamo a usare il modello FLASH (Il più comune)
  const modelToUse = "gemini-1.5-flash"; 
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [{ parts: [{ text: `Analizza per cantiere: ${text}` }] }]
  };

  try {
    console.log(`🤖 Tentativo chiamata a ${modelToUse}...`);
    
    const response = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      // ⚠️ SE FALLISCE: Facciamo partire l'indagine
      console.error(`🔥 Errore Generazione (${response.status}). Avvio diagnostica...`);
      
      // Chiamiamo Google per farci dare la LISTA dei modelli attivi
      await listAvailableModels(apiKey);
      
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) throw new Error("Risposta vuota");

    // Se funziona, restituiamo un JSON finto per testare il flusso
    return {
      category: "test",
      summary: "Funziona!",
      reply_to_user: aiText.substring(0, 100)
    };

  } catch (error) {
    console.error("🔥 Blocco Catch:", error);
    return fallbackError("Sto diagnosticando il problema AI. Controlla i log.");
  }
}

// 🕵️‍♂️ FUNZIONE SPIA: Elenca i modelli disponibili
async function listAvailableModels(key: string) {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    console.log("🕵️‍♂️ Richiedo lista modelli a Google...");
    
    const response = await fetch(listUrl);
    const data = await response.json();
    
    if (data.models) {
      console.log("✅ MODELLI DISPONIBILI PER QUESTA CHIAVE:");
      // Stampiamo solo i nomi dei modelli
      const names = data.models.map((m: any) => m.name);
      console.log(JSON.stringify(names, null, 2));
    } else {
      console.error("❌ NESSUN MODELLO TROVATO! (L'API è disattivata o la chiave è vuota)");
      console.error("Dettaglio risposta:", JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("❌ Errore durante la lista modelli:", e);
  }
}

function fallbackError(msg: string) {
  return { category: "errore", summary: "Errore", reply_to_user: msg };
}