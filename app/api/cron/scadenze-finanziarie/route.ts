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

  // 1. Recupera il numero WhatsApp gruppo soci
  const { data: params, error: paramsError } = await supabase
    .from("parametri_globali")
    .select("whatsapp_gruppo_soci")
    .single();

  if (paramsError || !params?.whatsapp_gruppo_soci) {
    console.error("❌ whatsapp_gruppo_soci non trovato:", paramsError);
    return NextResponse.json({ error: "whatsapp_gruppo_soci non configurato" }, { status: 500 });
  }

  const gruppoSoci = params.whatsapp_gruppo_soci;
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
        id, numero, importo, data_scadenza, emittente,
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

        const giorniMancanti = Math.ceil(
          (new Date(dataScad).getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 45gg
        if (giorniMancanti <= 45 && giorniMancanti > 20 && !scadenza.reminder_45gg_inviato) {
          const msg = `📝 *Cambiale in Scadenza (45gg)*\n\nN. ${c.numero || "N/D"}\nEmittente: ${c.emittente || "N/D"}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⏳ Mancano ${giorniMancanti} giorni`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_45gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 20gg
        if (giorniMancanti <= 20 && giorniMancanti > 7 && !scadenza.reminder_20gg_inviato) {
          const msg = `📝 *Cambiale in Scadenza (20gg)*\n\nN. ${c.numero || "N/D"}\nEmittente: ${c.emittente || "N/D"}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⚠️ Mancano ${giorniMancanti} giorni`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti >= 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Cambiale URGENTE (7gg)*\n\nN. ${c.numero || "N/D"}\nEmittente: ${c.emittente || "N/D"}\nImporto: ${formatEuro(Number(c.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
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
        id, numero, importo, data_scadenza, emittente,
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

        const giorniMancanti = Math.ceil(
          (new Date(dataScad).getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 45gg
        if (giorniMancanti <= 45 && giorniMancanti > 20 && !scadenza.reminder_45gg_inviato) {
          const msg = `✏️ *Assegno in Scadenza (45gg)*\n\nN. ${a.numero || "N/D"}\nEmittente: ${a.emittente || "N/D"}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⏳ Mancano ${giorniMancanti} giorni`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_45gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 20gg
        if (giorniMancanti <= 20 && giorniMancanti > 7 && !scadenza.reminder_20gg_inviato) {
          const msg = `✏️ *Assegno in Scadenza (20gg)*\n\nN. ${a.numero || "N/D"}\nEmittente: ${a.emittente || "N/D"}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n⚠️ Mancano ${giorniMancanti} giorni`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti >= 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Assegno URGENTE (7gg)*\n\nN. ${a.numero || "N/D"}\nEmittente: ${a.emittente || "N/D"}\nImporto: ${formatEuro(Number(a.importo))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
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
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_20gg_inviato: true }).eq("id", scadenza.id);
          notificatiTotali++;
        }

        // 7gg
        if (giorniMancanti <= 7 && giorniMancanti >= 0 && !scadenza.reminder_7gg_inviato) {
          const msg = `🚨 *Rata Mutuo URGENTE (7gg)*\n\nRata ${r.numero_rata} — ${bancaLabel}${scopoLabel}\nImporto: ${formatEuro(Number(r.importo_rata))}\nScadenza: ${new Date(dataScad).toLocaleDateString("it-IT")}\n\n❗ Mancano solo ${giorniMancanti} giorni!`;
          await sendWhatsAppMessage(gruppoSoci, msg);
          await supabase.from("scadenze_pagamento").update({ reminder_7gg_inviato: true }).eq("id", scadenza.id);
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

      const totale = totCambiali + totAssegni + totRate;

      if (totale > 0) {
        const wsLabel = format(ws, "dd/MM");
        const weLabel = format(we, "dd/MM");

        let msg = `📊 *Pianificazione Settimanale*\nSettimana: ${wsLabel} - ${weLabel}\n\n`;

        if (nRate > 0) msg += `🏦 Rate Mutui: ${formatEuro(totRate)} (${nRate} rate)\n`;
        if (nCambiali > 0) msg += `📝 Cambiali: ${formatEuro(totCambiali)} (${nCambiali} titoli)\n`;
        if (nAssegni > 0) msg += `✏️ Assegni: ${formatEuro(totAssegni)} (${nAssegni} titoli)\n`;

        msg += `\nTotale uscite previste: *${formatEuro(totale)}*`;

        await sendWhatsAppMessage(gruppoSoci, msg);
        notificatiTotali++;
      }
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
