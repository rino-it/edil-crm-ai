import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/utils/whatsapp";
import { NextResponse } from "next/server";
import { startOfWeek, endOfWeek, format } from "date-fns";

export const dynamic = "force-dynamic";

const formatEuro = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

export async function GET(request: Request) {
  // Protezione: verifica il secret Vercel Cron (skip se non configurato, per test manuali)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Consenti anche query param ?secret=xxx per test da browser
      const url = new URL(request.url);
      const secretParam = url.searchParams.get("secret");
      if (secretParam !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Recupera i numeri WhatsApp dei soci (separati da virgola)
  const { data: params, error: paramsError } = await supabase
    .from("parametri_globali")
    .select("whatsapp_gruppo_soci")
    .single();

  if (paramsError || !params?.whatsapp_gruppo_soci) {
    console.error("❌ whatsapp_gruppo_soci non trovato:", paramsError);
    return NextResponse.json({ error: "whatsapp_gruppo_soci non configurato. Inserisci i numeri dei soci separati da virgola (es: 393401234567,393409876543)" }, { status: 500 });
  }

  // Supporta più numeri separati da virgola
  const numeriSoci = params.whatsapp_gruppo_soci
    .split(",")
    .map((n: string) => n.trim())
    .filter((n: string) => n.length > 0);

  if (numeriSoci.length === 0) {
    return NextResponse.json({ error: "Nessun numero soci configurato" }, { status: 500 });
  }

  // Helper: invia lo stesso messaggio a tutti i soci
  const sendToSoci = async (msg: string) => {
    for (const numero of numeriSoci) {
      await sendWhatsAppMessage(numero, msg);
    }
  };

  const oggi = new Date();
  const oggiStr = oggi.toISOString().split("T")[0];

  let notificatiTotali = 0;
  const errori: string[] = [];

  // ==========================================
  // HELPER: calcola data futura
  // ==========================================
  const dataFra = (giorni: number): string => {
    const d = new Date(oggi);
    d.setDate(d.getDate() + giorni);
    return d.toISOString().split("T")[0];
  };

  // ==========================================
  // PARTE 1: CAMBIALI (45gg, 20gg, 7gg)
  // ==========================================
  try {
    const { data: cambiali } = await supabase
      .from("titoli")
      .select(`
        id, numero_titolo, importo, data_scadenza, soggetto_id,
        anagrafica_soggetti(ragione_sociale),
        scadenze_pagamento:scadenza_id (id, reminder_45gg_inviato, reminder_20gg_inviato, reminder_7gg_inviato)
      `)
      .eq("tipo", "cambiale")
      .neq("stato", "pagato")
      .not("scadenza_id", "is", null);

    if (cambiali) {
      for (const c of cambiali) {
        const scadenza = (c as any).scadenze_pagamento;
        if (!scadenza) continue;
        const dataScad = c.data_scadenza;
        if (!dataScad) continue;
        const emittente = (c as any).anagrafica_soggetti?.ragione_sociale || "N/D";

        const giorniMancanti = Math.ceil(
          (new Date(dataScad).getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 45gg
        if (giorniMancanti <= 45 && giorniMancanti > 20 && !scadenza.reminder_45gg_inviato) {
          const msg = `📝 *Cambiale in Scadenza (45gg)*\n\nN. ${c.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⏳ Mancano ${giorniMancanti} giorni`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_45gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 20gg
        if (giorniMancanti <= 20 && giorniMancanti > 7 && !scadenza.reminder_20gg_inviato) {
          const msg = `📝 *Cambiale in Scadenza (20gg)*\n\nN. ${c.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⚠️ Mancano ${giorniMancanti} giorni`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti > 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Cambiale URGENTE (7gg)*\n\nN. ${c.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // SCADE OGGI
        if (giorniMancanti === 0) {
          const msg = `🔴 *Cambiale SCADE OGGI!*\n\nN. ${c.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: OGGI ${new Date(dataScad).toLocaleDateString("it-IT")}`;
          await sendToSoci(msg);
          notificatiTotali++;
        }
      }
    }
  } catch (e) {
    console.error("❌ Errore notifiche cambiali:", e);
    errori.push("Errore cambiali");
  }

  // ==========================================
  // PARTE 2: ASSEGNI (45gg, 20gg, 7gg)
  // ==========================================
  try {
    const { data: assegni } = await supabase
      .from("titoli")
      .select(`
        id, numero_titolo, importo, data_scadenza, soggetto_id,
        anagrafica_soggetti(ragione_sociale),
        scadenze_pagamento:scadenza_id (id, reminder_45gg_inviato, reminder_20gg_inviato, reminder_7gg_inviato)
      `)
      .eq("tipo", "assegno")
      .neq("stato", "pagato")
      .not("scadenza_id", "is", null);

    if (assegni) {
      for (const a of assegni) {
        const scadenza = (a as any).scadenze_pagamento;
        if (!scadenza) continue;
        const dataScad = a.data_scadenza;
        if (!dataScad) continue;
        const emittente = (a as any).anagrafica_soggetti?.ragione_sociale || "N/D";

        const giorniMancanti = Math.ceil(
          (new Date(dataScad).getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 45gg
        if (giorniMancanti <= 45 && giorniMancanti > 20 && !scadenza.reminder_45gg_inviato) {
          const msg = `✏️ *Assegno in Scadenza (45gg)*\n\nN. ${a.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⏳ Mancano ${giorniMancanti} giorni`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_45gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 20gg
        if (giorniMancanti <= 20 && giorniMancanti > 7 && !scadenza.reminder_20gg_inviato) {
          const msg = `✏️ *Assegno in Scadenza (20gg)*\n\nN. ${a.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⚠️ Mancano ${giorniMancanti} giorni`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti > 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Assegno URGENTE (7gg)*\n\nN. ${a.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // SCADE OGGI
        if (giorniMancanti === 0) {
          const msg = `🔴 *Assegno SCADE OGGI!*\n\nN. ${a.numero_titolo || "N/D"}\nEmittente: ${emittente}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: OGGI ${new Date(dataScad).toLocaleDateString("it-IT")}`;
          await sendToSoci(msg);
          notificatiTotali++;
        }
      }
    }
  } catch (e) {
    console.error("❌ Errore notifiche assegni:", e);
    errori.push("Errore assegni");
  }

  // ==========================================
  // PARTE 3: RATE MUTUI (20gg, 7gg)
  // ==========================================
  try {
    const { data: rateMutuo } = await supabase
      .from("rate_mutuo")
      .select(`
        id, numero_rata, importo_rata, data_scadenza, stato,
        mutui:mutuo_id (banca_erogante, scopo),
        scadenze_pagamento:scadenza_id (id, reminder_20gg_inviato, reminder_7gg_inviato)
      `)
      .eq("stato", "da_pagare")
      .not("scadenza_id", "is", null);

    if (rateMutuo) {
      for (const r of rateMutuo) {
        const scadenza = (r as any).scadenze_pagamento;
        const mutuo = (r as any).mutui;
        if (!scadenza) continue;
        const dataScad = r.data_scadenza;
        if (!dataScad) continue;

        const giorniMancanti = Math.ceil(
          (new Date(dataScad).getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        const bancaLabel = mutuo?.banca_erogante || "N/D";
        const scopoLabel = mutuo?.scopo ? ` - ${mutuo.scopo}` : "";

        // 20gg
        if (giorniMancanti <= 20 && giorniMancanti > 7 && !scadenza.reminder_20gg_inviato) {
          const msg = `🏦 *Rata Mutuo in Scadenza (20gg)*\n\nRata ${r.numero_rata} — ${bancaLabel}${scopoLabel}\nImporto: ${formatEuro(Number(r.importo_rata))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⚠️ Mancano ${giorniMancanti} giorni`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti > 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Rata Mutuo URGENTE (7gg)*\n\nRata ${r.numero_rata} — ${bancaLabel}${scopoLabel}\nImporto: ${formatEuro(Number(r.importo_rata))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendToSoci(msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // SCADE OGGI
        if (giorniMancanti === 0) {
          const msg = `🔴 *Rata Mutuo SCADE OGGI!*\n\nRata ${r.numero_rata} — ${bancaLabel}${scopoLabel}\nImporto: ${formatEuro(Number(r.importo_rata))}\nScadenza: OGGI ${new Date(dataScad).toLocaleDateString("it-IT")}`;
          await sendToSoci(msg);
          notificatiTotali++;
        }
      }
    }
  } catch (e) {
    console.error("❌ Errore notifiche rate mutuo:", e);
    errori.push("Errore rate mutuo");
  }

  // ==========================================
  // PARTE 4: RIEPILOGO SETTIMANALE (solo Lunedì)
  // ==========================================
  if (oggi.getDay() === 1) {
    try {
      const ws = startOfWeek(oggi, { weekStartsOn: 1 });
      const we = endOfWeek(oggi, { weekStartsOn: 1 });
      const wsStr = ws.toISOString().split("T")[0];
      const weStr = we.toISOString().split("T")[0];

      // Cambiali della settimana
      const { data: cambSettimana } = await supabase
        .from("titoli")
        .select("importo")
        .eq("tipo", "cambiale")
        .neq("stato", "pagato")
        .gte("data_scadenza", wsStr)
        .lte("data_scadenza", weStr);

      const totCambiali = (cambSettimana || []).reduce((s, t) => s + Number(t.importo), 0);
      const nCambiali = (cambSettimana || []).length;

      // Assegni della settimana
      const { data: assSettimana } = await supabase
        .from("titoli")
        .select("importo")
        .eq("tipo", "assegno")
        .neq("stato", "pagato")
        .gte("data_scadenza", wsStr)
        .lte("data_scadenza", weStr);

      const totAssegni = (assSettimana || []).reduce((s, t) => s + Number(t.importo), 0);
      const nAssegni = (assSettimana || []).length;

      // Rate mutuo della settimana
      const { data: rateSettimana } = await supabase
        .from("rate_mutuo")
        .select("importo_rata")
        .eq("stato", "da_pagare")
        .gte("data_scadenza", wsStr)
        .lte("data_scadenza", weStr);

      const totRate = (rateSettimana || []).reduce((s, r) => s + Number(r.importo_rata), 0);
      const nRate = (rateSettimana || []).length;

      // Scadenze ordinarie USCITA (fatture da pagare) della settimana
      const { data: scadenzeUscitaSettimana } = await supabase
        .from("scadenze_pagamento")
        .select("importo_totale, importo_pagato")
        .eq("tipo", "uscita")
        .in("stato", ["da_pagare", "scaduto", "parziale"])
        .is("titolo_id", null)
        .gte("data_scadenza", wsStr)
        .lte("data_scadenza", weStr);

      const totUsciteOrd = (scadenzeUscitaSettimana || []).reduce(
        (s, r) => s + (Number(r.importo_totale) - Number(r.importo_pagato || 0)), 0
      );
      const nUsciteOrd = (scadenzeUscitaSettimana || []).length;

      // Scadenze ENTRATA (fatture da incassare) della settimana
      const { data: scadenzeEntrataSettimana } = await supabase
        .from("scadenze_pagamento")
        .select("importo_totale, importo_pagato")
        .eq("tipo", "entrata")
        .in("stato", ["da_pagare", "scaduto", "parziale"])
        .gte("data_scadenza", wsStr)
        .lte("data_scadenza", weStr);

      const totEntrate = (scadenzeEntrataSettimana || []).reduce(
        (s, r) => s + (Number(r.importo_totale) - Number(r.importo_pagato || 0)), 0
      );
      const nEntrate = (scadenzeEntrataSettimana || []).length;

      const totaleUscite = totCambiali + totAssegni + totRate + totUsciteOrd;
      const cashflowNetto = totEntrate - totaleUscite;

      const wsLabel = format(ws, "dd/MM");
      const weLabel = format(we, "dd/MM");

      let msg = `📊 *Riepilogo Cashflow Settimanale*\nSettimana: ${wsLabel} - ${weLabel}\n`;

      // USCITE
      msg += `\n💸 *USCITE PREVISTE*\n`;
      if (nUsciteOrd > 0) msg += `📄 Fatture fornitori: ${formatEuro(totUsciteOrd)} (${nUsciteOrd} scadenze)\n`;
      if (nRate > 0) msg += `🏦 Rate Mutui: ${formatEuro(totRate)} (${nRate} rate)\n`;
      if (nCambiali > 0) msg += `📝 Cambiali: ${formatEuro(totCambiali)} (${nCambiali} titoli)\n`;
      if (nAssegni > 0) msg += `✏️ Assegni: ${formatEuro(totAssegni)} (${nAssegni} titoli)\n`;
      if (totaleUscite === 0) msg += `Nessuna uscita prevista\n`;
      msg += `*Totale uscite: ${formatEuro(totaleUscite)}*\n`;

      // ENTRATE
      msg += `\n💰 *ENTRATE PREVISTE*\n`;
      if (nEntrate > 0) msg += `📄 Incassi attesi: ${formatEuro(totEntrate)} (${nEntrate} scadenze)\n`;
      if (totEntrate === 0) msg += `Nessuna entrata prevista\n`;
      msg += `*Totale entrate: ${formatEuro(totEntrate)}*\n`;

      // SALDO NETTO
      msg += `\n${cashflowNetto >= 0 ? "✅" : "🔴"} *Cashflow netto: ${formatEuro(cashflowNetto)}*`;

      await sendToSoci(msg);
      notificatiTotali++;
    } catch (e) {
      console.error("❌ Errore riepilogo settimanale:", e);
      errori.push("Errore riepilogo settimanale");
    }
  }

  return NextResponse.json({
    success: true,
    notifiche_inviate: notificatiTotali,
    errori: errori.length > 0 ? errori : undefined,
    timestamp: oggiStr,
  });
}
