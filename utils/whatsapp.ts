export async function sendWhatsAppMessage(to: string, body: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_ID; // Es. 923366690869013

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
          to: to, // Il numero del destinatario
          type: "text",
          text: {
            preview_url: false,
            body: body, // Il messaggio generato dall'AI
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