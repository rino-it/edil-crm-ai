import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/utils/whatsapp";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const formatEuro = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  // Numeri soci
  const { data: params } = await supabase
    .from("parametri_globali")
    .select("whatsapp_gruppo_soci")
    .single();

  if (!params?.whatsapp_gruppo_soci) {
    return NextResponse.json({ error: "whatsapp_gruppo_soci non configurato" }, { status: 500 });
  }

  const numeriSoci = params.whatsapp_gruppo_soci
    .split(",")
    .map((n: string) => n.trim())
    .filter((n: string) => n.length > 0);

  const sendToSoci = async (msg: string) => {
    for (const numero of numeriSoci) {
      await sendWhatsAppMessage(numero, msg);
    }
  };

  // Calcola DOMANI
  const oggi = new Date();
  const domani = new Date(oggi);
  domani.setDate(domani.getDate() + 1);
  const domaniStr = domani.toISOString().split("T")[0];
  const domaniLabel = domani.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  let items: string[] = [];
  let totaleUscite = 0;

  // 1. Cambiali domani
  const { data: cambiali } = await supabase
    .from("titoli")
    .select("numero_titolo, importo, data_scadenza, anagrafica_soggetti:soggetto_id(ragione_sociale)")
    .eq("tipo", "cambiale")
    .neq("stato", "pagato")
    .eq("data_scadenza", domaniStr);

  if (cambiali) {
    for (const c of cambiali) {
      const nome = (c as any).anagrafica_soggetti?.ragione_sociale || "N/D";
      const imp = Number(c.importo);
      items.push(`📝 Cambiale N.${c.numero_titolo || "?"} — ${nome} — ${formatEuro(imp)}`);
      totaleUscite += imp;
    }
  }

  // 2. Assegni domani
  const { data: assegni } = await supabase
    .from("titoli")
    .select("numero_titolo, importo, data_scadenza, anagrafica_soggetti:soggetto_id(ragione_sociale)")
    .eq("tipo", "assegno")
    .neq("stato", "pagato")
    .eq("data_scadenza", domaniStr);

  if (assegni) {
    for (const a of assegni) {
      const nome = (a as any).anagrafica_soggetti?.ragione_sociale || "N/D";
      const imp = Number(a.importo);
      items.push(`✏️ Assegno N.${a.numero_titolo || "?"} — ${nome} — ${formatEuro(imp)}`);
      totaleUscite += imp;
    }
  }

  // 3. Rate mutuo domani
  const { data: rate } = await supabase
    .from("rate_mutuo")
    .select("numero_rata, importo_rata, data_scadenza, mutui:mutuo_id(banca_erogante, scopo)")
    .eq("stato", "da_pagare")
    .eq("data_scadenza", domaniStr);

  if (rate) {
    for (const r of rate) {
      const mutuo = (r as any).mutui;
      const banca = mutuo?.banca_erogante || "N/D";
      const scopo = mutuo?.scopo ? ` (${mutuo.scopo})` : "";
      const imp = Number(r.importo_rata);
      items.push(`🏦 Rata ${r.numero_rata} — ${banca}${scopo} — ${formatEuro(imp)}`);
      totaleUscite += imp;
    }
  }

  // 4. Scadenze pagamento uscita domani
  const { data: scadenze } = await supabase
    .from("scadenze_pagamento")
    .select("fattura_riferimento, importo_totale, importo_pagato, anagrafica_soggetti:soggetto_id(ragione_sociale)")
    .eq("tipo", "uscita")
    .in("stato", ["da_pagare", "scaduto", "parziale"])
    .is("titolo_id", null)
    .eq("data_scadenza", domaniStr);

  if (scadenze) {
    for (const s of scadenze) {
      const nome = (s as any).anagrafica_soggetti?.ragione_sociale || "N/D";
      const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
      if (residuo <= 0) continue;
      items.push(`📄 ${nome} — Fatt. ${s.fattura_riferimento || "?"} — ${formatEuro(residuo)}`);
      totaleUscite += residuo;
    }
  }

  // 5. Incassi attesi domani (entrate)
  let totaleEntrate = 0;
  const entrateItems: string[] = [];
  const { data: entrate } = await supabase
    .from("scadenze_pagamento")
    .select("fattura_riferimento, importo_totale, importo_pagato, anagrafica_soggetti:soggetto_id(ragione_sociale)")
    .eq("tipo", "entrata")
    .in("stato", ["da_pagare", "scaduto", "parziale"])
    .eq("data_scadenza", domaniStr);

  if (entrate) {
    for (const e of entrate) {
      const nome = (e as any).anagrafica_soggetti?.ragione_sociale || "N/D";
      const residuo = Number(e.importo_totale) - Number(e.importo_pagato || 0);
      if (residuo <= 0) continue;
      entrateItems.push(`💰 ${nome} — Fatt. ${e.fattura_riferimento || "?"} — ${formatEuro(residuo)}`);
      totaleEntrate += residuo;
    }
  }

  // Se non c'è nulla domani, non mandare niente
  if (items.length === 0 && entrateItems.length === 0) {
    return NextResponse.json({ success: true, message: "Nessun pagamento domani", notifiche: 0 });
  }

  // Componi messaggio
  let msg = `📅 *Pagamenti di DOMANI* (${domaniLabel})\n`;

  if (items.length > 0) {
    msg += `\n💸 *USCITE — ${formatEuro(totaleUscite)}*\n`;
    msg += items.join("\n");
  }

  if (entrateItems.length > 0) {
    msg += `\n\n💰 *ENTRATE ATTESE — ${formatEuro(totaleEntrate)}*\n`;
    msg += entrateItems.join("\n");
  }

  const netto = totaleEntrate - totaleUscite;
  msg += `\n\n${netto >= 0 ? "✅" : "🔴"} *Netto: ${formatEuro(netto)}*`;

  await sendToSoci(msg);

  return NextResponse.json({
    success: true,
    notifiche: numeriSoci.length,
    uscite: items.length,
    entrate: entrateItems.length,
    totale_uscite: totaleUscite,
    totale_entrate: totaleEntrate,
  });
}
