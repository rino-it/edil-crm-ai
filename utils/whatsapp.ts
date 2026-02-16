export async function sendWhatsAppMessage(to: string, body: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_ID;

  if (!token || !phoneId) {
    console.error("❌ Manca il Token o il Phone ID nelle variabili d'ambiente!");
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "text",
          text: {
            preview_url: false,
            body: body,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Errore invio WhatsApp:", JSON.stringify(errorData, null, 2));
    } else {
      console.log(`📤 Risposta inviata a ${to}: "${body.substring(0, 20)}..."`);
    }
  } catch (error) {
    console.error("🔥 Errore fetch WhatsApp:", error);
  }
}

// ============================================================
// DOWNLOAD MEDIA DA WHATSAPP CLOUD API
// ============================================================

export interface MediaDownloadResult {
  base64: string;
  mimeType: string;
  buffer: Buffer; // <--- 1. AGGIUNTO: Esponiamo il buffer per l'upload su Supabase
}

export async function downloadMedia(mediaId: string): Promise<MediaDownloadResult | null> {
  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.error("❌ META_ACCESS_TOKEN mancante per il download media!");
    return null;
  }

  try {
    // Step 1: Richiediamo a Meta l'URL reale del file
    const urlResponse = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!urlResponse.ok) {
      const err = await urlResponse.json();
      console.error("❌ Errore recupero URL media:", JSON.stringify(err, null, 2));
      throw new Error(`Impossibile trovare URL media: ${urlResponse.status}`);
    }

    const urlData = await urlResponse.json();
    const mediaUrl = urlData.url;
    const mimeType = urlData.mime_type || "image/jpeg";

    console.log(`🔗 URL media ottenuto (mime: ${mimeType}). Download in corso...`);

    // Step 2: Scarichiamo i dati binari
    const mediaResponse = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!mediaResponse.ok) {
      throw new Error(`Impossibile scaricare file media: ${mediaResponse.status}`);
    }

    // Step 3: Convertiamo in Base64 per Gemini e Buffer per Supabase
    const arrayBuffer = await mediaResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer); // Il buffer viene creato qui
    const base64 = buffer.toString("base64");

    const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`📸 Media ${mediaId} scaricato! (${sizeMB} MB, ${mimeType})`);

    return { 
        base64, 
        mimeType, 
        buffer // <--- 2. AGGIUNTO: Restituiamo il buffer
    };

  } catch (error) {
    console.error("🔥 Errore download media:", error);
    return null;
  }
}