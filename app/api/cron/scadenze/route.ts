import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/utils/whatsapp";
import { getDocumentiCantiereInScadenza } from "@/utils/data-fetcher";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Protezione: verifica il secret Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Recupera il numero WhatsApp admin da parametri_globali
  const { data: params, error: paramsError } = await supabase
    .from("parametri_globali")
    .select("admin_whatsapp")
    .single();

  if (paramsError || !params?.admin_whatsapp) {
    console.error("❌ admin_whatsapp non trovato in parametri_globali:", paramsError);
    return NextResponse.json({ error: "admin_whatsapp non configurato" }, { status: 500 });
  }

  const adminWhatsapp = params.admin_whatsapp;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edil-crm-ai.vercel.app";
  const oggi = new Date();
  const oggiStr = oggi.toISOString().split("T")[0];

  let notificatiTotali = 0;
  const errori: string[] = [];

  // ==========================================
  // PARTE 1: SCADENZE PERSONALE
  // ==========================================
  const limite30gg = new Date(oggi);
  limite30gg.setDate(limite30gg.getDate() + 30);
  const limite30ggStr = limite30gg.toISOString().split("T")[0];

  const { data: docPersonale } = await supabase
    .from("personale_documenti")
    .select("id, nome, data_scadenza")
    .lte("data_scadenza", limite30ggStr)
    .eq("scadenza_notificata", false)
    .not("data_scadenza", "is", null);

  if (docPersonale) {
    for (const doc of docPersonale) {
      const dataFormattata = new Date(doc.data_scadenza).toLocaleDateString("it-IT");
      const messaggio = `⚠️ *Scadenza Personale*\nIl documento _${doc.nome}_ scade il ${dataFormattata}.`;
      try {
        await sendWhatsAppMessage(adminWhatsapp, messaggio);
        await supabase.from("personale_documenti").update({ scadenza_notificata: true }).eq("id", doc.id);
        notificatiTotali++;
      } catch (err) { errori.push(`Personale-${doc.id}`); }
    }
  }

  // ==========================================
  // PARTE 2: SCADENZE CANTIERE
  // ==========================================
  try {
    const docCantiere = await getDocumentiCantiereInScadenza(30);
    if (docCantiere) {
      for (const doc of docCantiere) {
        const dataFormattata = new Date(doc.data_scadenza!).toLocaleDateString("it-IT");
        const messaggio = `🏗️ *Scadenza Cantiere*\nDoc: _${doc.nome_file}_\nCantiere: *${doc.cantieri?.nome}*\nScade: ${dataFormattata}`;
        try {
          await sendWhatsAppMessage(adminWhatsapp, messaggio);
          await supabase.from("cantiere_documenti").update({ scadenza_notificata: true }).eq("id", doc.id);
          notificatiTotali++;
        } catch (err) { errori.push(`Cantiere-${doc.id}`); }
      }
    }
  } catch (e) { console.error(e); }

  // ==========================================
  // PARTE 3: SCADENZE PAGAMENTO (Priorità Crediti)
  // ==========================================
  
  // A. Aggiornamento automatico stato 'scaduto'
  await supabase
    .from("scadenze_pagamento")
    .update({ stato: 'scaduto' })
    .lt("data_scadenza", oggiStr)
    .in("stato", ["da_pagare", "parziale"]);

  // B. Query scadenze imminenti (prossimi 7 giorni)
  const limite7gg = new Date(oggi);
  limite7gg.setDate(limite7gg.getDate() + 7);
  const limite7ggStr = limite7gg.toISOString().split("T")[0];

  const { data: scadenzeFin } = await supabase
    .from("scadenze_pagamento")
    .select(`
      id, tipo, fattura_riferimento, importo_totale, importo_pagato, data_scadenza,
      soggetto:anagrafica_soggetti(ragione_sociale)
    `)
    .lte("data_scadenza", limite7ggStr)
    .eq("scadenza_notificata", false)
    .neq("stato", "pagato");

  if (scadenzeFin) {
    for (const s of scadenzeFin) {
      const residuo = s.importo_totale - (s.importo_pagato || 0);
      const dataFmt = new Date(s.data_scadenza).toLocaleDateString("it-IT");
      const nomeSog = (s.soggetto as any)?.ragione_sociale || "Sconosciuto";
      const rif = s.fattura_riferimento || "N/D";

      let msg = "";
      if (s.tipo === 'entrata') {
        msg = `💰 *Credito in scadenza*\nCliente: *${nomeSog}*\nFattura: ${rif}\nImporto: €${residuo.toFixed(2)}\nScade: ${dataFmt}\n⚠️ Sollecitare incasso!`;
      } else {
        msg = `💸 *Pagamento in scadenza*\nFornitore: *${nomeSog}*\nFattura: ${rif}\nImporto: €${residuo.toFixed(2)}\nScade: ${dataFmt}`;
      }

      try {
        await sendWhatsAppMessage(adminWhatsapp, msg);
        await supabase.from("scadenze_pagamento").update({ scadenza_notificata: true }).eq("id", s.id);
        notificatiTotali++;
      } catch (err) { errori.push(`Pagamento-${s.id}`); }
    }
  }

  // ==========================================
  // PARTE 4: REMINDER UPLOAD ESTRATTO CONTO
  // ==========================================
  // Si attiva solo ed esclusivamente il giorno 5 del mese
  if (oggi.getDate() === 5) {
    // Calcoliamo il mese precedente (es. il 5 Febbraio verifico Gennaio)
    let targetMese = oggi.getMonth(); // getMonth() restituisce 0 per Gennaio, 1 per Febbraio, ecc.
    let targetAnno = oggi.getFullYear();
    
    // Se oggi è il 5 Gennaio (0), il target è Dicembre (12) dell'anno prima
    if (targetMese === 0) {
      targetMese = 12;
      targetAnno -= 1;
    }

    const { data: contiAttivi } = await supabase
      .from("conti_banca")
      .select("id, nome_banca, nome_conto")
      .eq("attivo", true);

    if (contiAttivi) {
      for (const conto of contiAttivi) {
        // Verifica se l'upload per il targetMese è già stato fatto
        const { data: uploadEsistente } = await supabase
          .from("upload_banca")
          .select("id")
          .eq("conto_banca_id", conto.id)
          .eq("anno", targetAnno)
          .eq("mese", targetMese)
          .single();

        // Se l'upload NON esiste, invia il reminder
        if (!uploadEsistente) {
          const dataCalendario = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-05`;
          // Sfrutta la nuova rotta API calendar creata nello Step 3.6
          const linkCalendario = `${siteUrl}/api/calendar?titolo=Upload+Estratto+Conto+${encodeURIComponent(conto.nome_banca)}&data=${dataCalendario}`;
          
          const msgBanca = `🏦 *Promemoria Finanza*\nRicorda di scaricare e importare l'estratto conto di *${conto.nome_banca}* (${conto.nome_conto}) relativo a *${targetMese}/${targetAnno}*.\n\nFallo dalla web app nella sezione Riconciliazione Bancaria.\n📅 Salva promemoria: ${linkCalendario}`;
          
          try {
            await sendWhatsAppMessage(adminWhatsapp, msgBanca);
            notificatiTotali++;
          } catch (err) {
            errori.push(`BancaUpload-${conto.id}`);
          }
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    notificati_totali: notificatiTotali,
    errori: errori.length,
    dettaglio_errori: errori
  });
}