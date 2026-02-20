import { createClient } from "@/utils/supabase/server";
import { sendWhatsAppMessage } from "@/utils/whatsapp";
import { getDocumentiCantiereInScadenza } from "@/utils/data-fetcher";
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  let notificatiTotali = 0;
  const errori: string[] = [];

  // ==========================================
  // PARTE 1: SCADENZE PERSONALE (Logica Esistente)
  // ==========================================
  const oggi = new Date();
  const limite = new Date(oggi);
  limite.setDate(limite.getDate() + 30);
  const limiteDateStr = limite.toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: docPersonale, error: errPersonale } = await supabase
    .from("personale_documenti")
    .select("id, nome, data_scadenza")
    .lte("data_scadenza", limiteDateStr)
    .eq("scadenza_notificata", false)
    .not("data_scadenza", "is", null);

  if (docPersonale && docPersonale.length > 0) {
    for (const doc of docPersonale) {
      const dataFormattata = new Date(doc.data_scadenza).toLocaleDateString("it-IT");
      const calendarLink = `${siteUrl}/api/calendar?titolo=${encodeURIComponent(doc.nome)}&data=${doc.data_scadenza}`;
      const messaggio = `⚠️ *Scadenza Personale*\nIl documento _${doc.nome}_ scade il ${dataFormattata}.\n\n📅 Salva a calendario: ${calendarLink}`;

      try {
        await sendWhatsAppMessage(adminWhatsapp, messaggio);
        const { error } = await supabase.from("personale_documenti").update({ scadenza_notificata: true }).eq("id", doc.id);
        if (!error) notificatiTotali++;
      } catch (err) {
        errori.push(`Personale-${doc.id}`);
      }
    }
  }

  // ==========================================
  // PARTE 2: SCADENZE CANTIERE (Nuova Logica)
  // ==========================================
  try {
    const docCantiere = await getDocumentiCantiereInScadenza(30); // Usa la vista dinamica

    if (docCantiere && docCantiere.length > 0) {
      for (const doc of docCantiere) {
        if (!doc.data_scadenza) continue;

        const dataFormattata = new Date(doc.data_scadenza).toLocaleDateString("it-IT");
        const nomeCantiere = doc.cantieri?.nome || "Cantiere Sconosciuto";
        const calendarLink = `${siteUrl}/api/calendar?titolo=${encodeURIComponent(doc.nome_file)}&data=${doc.data_scadenza}&cantiere=${encodeURIComponent(nomeCantiere)}`;
        
        const messaggio = `🏗️ *Scadenza Cantiere Imminente*\n` +
                          `📄 Documento: _${doc.nome_file}_\n` +
                          `📍 Cantiere: *${nomeCantiere}*\n` +
                          `📅 Scade il: ${dataFormattata}\n\n` +
                          `📲 Salva a calendario: ${calendarLink}`;

        try {
          await sendWhatsAppMessage(adminWhatsapp, messaggio);
          // Aggiorna tabella fisica (non la vista)
          const { error } = await supabase.from("cantiere_documenti").update({ scadenza_notificata: true }).eq("id", doc.id);
          if (!error) notificatiTotali++;
        } catch (err) {
          errori.push(`Cantiere-${doc.id}`);
        }
      }
    }
  } catch (errCantiere) {
    console.error("❌ Errore ricerca documenti cantiere:", errCantiere);
    errori.push("Errore query cantiere");
  }

  return NextResponse.json({
    success: true,
    notificati_totali: notificatiTotali,
    errori: errori.length,
    dettaglio_errori: errori
  });
}