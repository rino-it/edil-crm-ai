import { createClient } from "@/utils/supabase/server";
import { sendWhatsAppMessage } from "@/utils/whatsapp";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Protezione: verifica il secret Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // 1. Recupera il numero WhatsApp admin da parametri_globali
  const { data: params, error: paramsError } = await supabase
    .from("parametri_globali")
    .select("admin_whatsapp")
    .single();

  if (paramsError || !params?.admin_whatsapp) {
    console.error("❌ admin_whatsapp non trovato in parametri_globali:", paramsError);
    return NextResponse.json(
      { error: "admin_whatsapp non configurato" },
      { status: 500 }
    );
  }

  const adminWhatsapp = params.admin_whatsapp;

  // 2. Calcola la data limite (oggi + 30 giorni)
  const oggi = new Date();
  const limite = new Date(oggi);
  limite.setDate(limite.getDate() + 30);
  const limiteDateStr = limite.toISOString().split("T")[0]; // YYYY-MM-DD

  // 3. Cerca documenti in scadenza non ancora notificati
  const { data: documenti, error: docsError } = await supabase
    .from("personale_documenti")
    .select("id, nome, data_scadenza")
    .lte("data_scadenza", limiteDateStr)
    .eq("scadenza_notificata", false)
    .not("data_scadenza", "is", null);

  if (docsError) {
    console.error("❌ Errore query personale_documenti:", docsError);
    return NextResponse.json({ error: docsError.message }, { status: 500 });
  }

  if (!documenti || documenti.length === 0) {
    console.log("✅ Nessun documento in scadenza da notificare.");
    return NextResponse.json({ notificati: 0 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const notificatiIds: string[] = [];
  const errori: string[] = [];

  // 4. Per ogni documento: invia WhatsApp e aggiorna il DB
  for (const doc of documenti) {
    const dataFormattata = new Date(doc.data_scadenza).toLocaleDateString("it-IT");
    const calendarLink = `${siteUrl}/api/calendar?titolo=${encodeURIComponent(doc.nome)}&data=${doc.data_scadenza}`;
    const messaggio = `⚠️ Attenzione: Il documento ${doc.nome} scade il ${dataFormattata}. Promemoria: ${calendarLink}`;

    try {
      await sendWhatsAppMessage(adminWhatsapp, messaggio);

      // Aggiorna scadenza_notificata = true solo se l'invio non ha lanciato eccezioni
      const { error: updateError } = await supabase
        .from("personale_documenti")
        .update({ scadenza_notificata: true })
        .eq("id", doc.id);

      if (updateError) {
        console.error(`❌ Errore aggiornamento doc ${doc.id}:`, updateError);
        errori.push(doc.id);
      } else {
        notificatiIds.push(doc.id);
      }
    } catch (err) {
      console.error(`❌ Errore invio WhatsApp per doc ${doc.id}:`, err);
      errori.push(doc.id);
    }
  }

  return NextResponse.json({
    notificati: notificatiIds.length,
    errori: errori.length,
    ids_notificati: notificatiIds,
    ids_errori: errori,
  });
}
