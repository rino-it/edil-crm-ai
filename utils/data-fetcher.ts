// ============================================================
// DATA FETCHER - Query Supabase per dati reali cantieri
// Usato dal webhook per fornire contesto reale a Gemini (RAG)
// e per inserire movimenti (DDT automatici)
//
// Legge da: vista_cantieri_budget (VIEW SQL)
// Scrive su: movimenti (tabella reale)
// ============================================================

import { createClient } from "@supabase/supabase-js";

// Client Admin (Service Role bypassa RLS)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// --- Interfacce ---

export interface CantiereData {
  id: string;
  nome: string;
  budget_costi: number;
  valore_vendita: number;
  speso_materiali: number;
  speso_manodopera: number;
  speso_totale: number;
  residuo_budget: number;
  margine: number;
  percentuale_costi: number;
  percentuale_margine: number;
  stato: string;
  lat_cantiere: number | null;
  lng_cantiere: number | null;
  indirizzo: string | null;
}

export interface MovimentoInput {
  cantiere_id: string;
  tipo: "materiale" | "manodopera" | "spesa_generale";
  descrizione: string;
  importo: number;
  data_movimento: string;
  fornitore?: string;
  file_url?: string | null; 
  numero_documento?: string | null; // <--- MODIFICA 1: Campo aggiunto
}

// ============================================================
// RICERCA CANTIERE PER NOME (match parziale con ILIKE)
// Legge dalla vista che ha già speso e rimanente pre-calcolati
// ============================================================

export async function getCantiereData(
  searchName: string
): Promise<CantiereData | null> {
  if (!searchName || searchName.trim().length < 2) {
    console.warn("⚠️ search_key troppo corta, skip ricerca cantiere");
    return null;
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("vista_cantieri_budget")
      .select("*")
      .ilike("nome", `%${searchName.trim()}%`)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn(`⚠️ Nessun cantiere trovato per: "${searchName}"`);
      return null;
    }

    const percentuale_costi =
      data.budget_costi > 0
        ? Math.round((data.speso_totale / data.budget_costi) * 100)
        : 0;
    const percentuale_margine =
      data.valore_vendita > 0
        ? Math.round((data.margine_reale / data.valore_vendita) * 100)
        : 0;

    console.log(
      `📊 Cantiere: ${data.nome} | Speso €${data.speso_totale}/${data.budget_costi} (${percentuale_costi}%) | Margine €${data.margine_reale}`
    );

    return {
      id: data.id,
      nome: data.nome,
      budget_costi: data.budget_costi,
      valore_vendita: data.valore_vendita,
      speso_materiali: data.speso_materiali,
      speso_manodopera: data.speso_manodopera,
      speso_totale: data.speso_totale,
      residuo_budget: data.residuo_budget_costi,
      margine: data.margine_reale,
      percentuale_costi,
      percentuale_margine,
      stato: data.stato,
      lat_cantiere: data.lat_cantiere || null,
      lng_cantiere: data.lng_cantiere || null,
      indirizzo: data.indirizzo || null,
    };
  } catch (error) {
    console.error("🔥 Errore query cantiere:", error);
    return null;
  }
}

// ============================================================
// LISTA TUTTI I CANTIERI APERTI (per domande generiche)
// ============================================================

export async function getCantieriAttivi(): Promise<CantiereData[]> {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("vista_cantieri_budget")
      .select("*")
      .eq("stato", "aperto")
      .order("nome");

    if (error || !data || data.length === 0) {
      console.warn("⚠️ Nessun cantiere aperto trovato");
      return [];
    }

    return data.map((c) => ({
      id: c.id,
      nome: c.nome,
      budget_costi: c.budget_costi,
      valore_vendita: c.valore_vendita,
      speso_materiali: c.speso_materiali,
      speso_manodopera: c.speso_manodopera,
      speso_totale: c.speso_totale,
      residuo_budget: c.residuo_budget_costi,
      margine: c.margine_reale,
      percentuale_costi:
        c.budget_costi > 0
          ? Math.round((c.speso_totale / c.budget_costi) * 100)
          : 0,
      percentuale_margine:
        c.valore_vendita > 0
          ? Math.round((c.margine_reale / c.valore_vendita) * 100)
          : 0,
      stato: c.stato,
      lat_cantiere: c.lat_cantiere || null,
      lng_cantiere: c.lng_cantiere || null,
      indirizzo: c.indirizzo || null,
    }));
  } catch (error) {
    console.error("🔥 Errore query cantieri aperti:", error);
    return [];
  }
}

// ============================================================
// INSERISCI MOVIMENTO (DDT confermato → scrivi in movimenti)
// ============================================================

export async function inserisciMovimento(
  movimento: MovimentoInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  try {
    const { error } = await supabase.from("movimenti").insert({
      cantiere_id: movimento.cantiere_id,
      tipo: movimento.tipo,
      descrizione: movimento.descrizione,
      importo: movimento.importo,
      data_movimento: movimento.data_movimento,
      fornitore: movimento.fornitore || null,
      file_url: movimento.file_url || null, 
      numero_documento: movimento.numero_documento || null, // <--- MODIFICA 2: Passaggio al DB
    });

    if (error) {
      console.error("❌ Errore insert movimento:", error);
      return { success: false, error: error.message };
    }

    console.log(
      `✅ Movimento inserito: €${movimento.importo} su cantiere ${movimento.cantiere_id}`
    );
    return { success: true };
  } catch (error) {
    console.error("🔥 Errore insert movimento:", error);
    return { success: false, error: "Errore imprevisto" };
  }
}

// ============================================================
// PERSONALE: Cerca dipendente per nome (match parziale)
// ============================================================

export interface PersonaleData {
  id: string;
  nome: string;
  telefono: string | null;
  costo_orario: number;
  ruolo: string;
  costo_config: Record<string, unknown> | null;
  lat_partenza: number | null;
  lng_partenza: number | null;
  indirizzo_partenza: string | null;
}

export async function getPersonaleByNome(
  nome: string
): Promise<PersonaleData | null> {
  if (!nome || nome.trim().length < 2) return null;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale")
    .select("*")
    .eq("attivo", true)
    .ilike("nome", `%${nome.trim()}%`)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`⚠️ Nessun dipendente trovato per: "${nome}"`);
    return null;
  }

  return {
    id: data.id,
    nome: data.nome,
    telefono: data.telefono,
    costo_orario: data.costo_orario || 0,
    ruolo: data.ruolo,
    costo_config: data.costo_config || null,
    lat_partenza: data.lat_partenza || null,
    lng_partenza: data.lng_partenza || null,
    indirizzo_partenza: data.indirizzo_partenza || null,
  };
}

// ============================================================
// PERSONALE: Cerca dipendente per numero telefono (per "Io")
// ============================================================

export async function getPersonaleByTelefono(
  telefono: string
): Promise<PersonaleData | null> {
  if (!telefono) return null;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale")
    .select("*")
    .eq("attivo", true)
    .eq("telefono", telefono)
    .limit(1)
    .single();

  if (error || !data) {
    console.warn(`⚠️ Nessun dipendente trovato per telefono: ${telefono}`);
    return null;
  }

  return {
    id: data.id,
    nome: data.nome,
    telefono: data.telefono,
    costo_orario: data.costo_orario || 0,
    ruolo: data.ruolo,
    costo_config: data.costo_config || null,
    lat_partenza: data.lat_partenza || null,
    lng_partenza: data.lng_partenza || null,
    indirizzo_partenza: data.indirizzo_partenza || null,
  };
}

// ============================================================
// PRESENZE: Risolvi lista nomi → lista PersonaleData
// "ME_STESSO" viene risolto con il numero del mittente
// ============================================================

export interface PersonaRisolta {
  personale: PersonaleData;
  nome_originale: string; // Il nome come scritto dall'utente
}

export async function risolviPersonale(
  nomi: string[],
  senderPhone: string
): Promise<{ trovati: PersonaRisolta[]; nonTrovati: string[] }> {
  const trovati: PersonaRisolta[] = [];
  const nonTrovati: string[] = [];

  for (const nome of nomi) {
    let persona: PersonaleData | null = null;

    if (nome.toUpperCase() === "ME_STESSO") {
      persona = await getPersonaleByTelefono(senderPhone);
      if (persona) {
        trovati.push({ personale: persona, nome_originale: "Io" });
      } else {
        nonTrovati.push("Te stesso (numero non registrato)");
      }
    } else {
      persona = await getPersonaleByNome(nome);
      if (persona) {
        trovati.push({ personale: persona, nome_originale: nome });
      } else {
        nonTrovati.push(nome);
      }
    }
  }

  return { trovati, nonTrovati };
}

// ============================================================
// PRESENZE: Inserisci presenze per più persone
// ============================================================

export interface PresenzaInput {
  cantiere_id: string;
  personale_id: string;
  ore: number;
  descrizione?: string;
  data?: string;
  costo_calcolato: number;
}

export async function inserisciPresenze(
  presenze: PresenzaInput[]
): Promise<{ success: boolean; inserite: number; error?: string }> {
  const supabase = getSupabaseAdmin();

  try {
    const rows = presenze.map((p) => ({
      cantiere_id: p.cantiere_id,
      personale_id: p.personale_id,
      ore: p.ore,
      descrizione: p.descrizione || null,
      data: p.data || new Date().toISOString().split("T")[0],
      costo_calcolato: p.costo_calcolato,
    }));

    const { error } = await supabase.from("presenze").insert(rows);

    if (error) {
      console.error("❌ Errore insert presenze:", error);
      return { success: false, inserite: 0, error: error.message };
    }

    console.log(`✅ ${rows.length} presenze inserite`);
    return { success: true, inserite: rows.length };
  } catch (error) {
    console.error("🔥 Errore insert presenze:", error);
    return { success: false, inserite: 0, error: "Errore imprevisto" };
  }
}

// ============================================================
// HELPER: Formatta i dati cantiere in testo leggibile per Gemini
// ============================================================

export function formatCantiereForAI(cantiere: CantiereData): string {
  let text = `DATI REALI DAL DATABASE:
- Cantiere: ${cantiere.nome}
- Budget Costi Previsto: €${cantiere.budget_costi.toLocaleString("it-IT")}
- Speso Materiali: €${cantiere.speso_materiali.toLocaleString("it-IT")}
- Speso Manodopera: €${cantiere.speso_manodopera.toLocaleString("it-IT")}
- TOTALE SPESO: €${cantiere.speso_totale.toLocaleString("it-IT")} (${cantiere.percentuale_costi}% del budget costi)
- Residuo Budget Costi: €${cantiere.residuo_budget.toLocaleString("it-IT")}`;

  if (cantiere.valore_vendita > 0) {
    text += `
- Valore Appalto (Vendita): €${cantiere.valore_vendita.toLocaleString("it-IT")}
- MARGINE UTILE: €${cantiere.margine.toLocaleString("it-IT")} (${cantiere.percentuale_margine}% del valore vendita)`;
  }

  text += `\n- Stato: ${cantiere.stato}`;
  return text;
}

// ============================================================
// PARAMETRI GLOBALI: Legge Knowledge Base aziendale
// ============================================================

export async function getParametriGlobali(): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("parametri_globali")
    .select("chiave, valore");

  if (error || !data) {
    console.warn("⚠️ Impossibile leggere parametri_globali:", error?.message);
    return {};
  }

  return Object.fromEntries(data.map((r) => [r.chiave, r.valore]));
}

// ============================================================
// PERSONALE DOCUMENTI: Salva documento con dati estratti AI
// ============================================================

export interface DocumentoPersonaleInput {
  personale_id: string;
  url_file: string | null;
  categoria_documento: "contratto" | "visita_medica" | "corso_sicurezza";
  dati_estratti: Record<string, unknown>;
  data_scadenza?: string | null;
  data_documento?: string | null;
}

export async function salvaDocumentoBozza(
  doc: DocumentoPersonaleInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale_documenti")
    .insert({
      personale_id: doc.personale_id,
      url_file: doc.url_file || null,
      categoria_documento: doc.categoria_documento,
      dati_estratti: doc.dati_estratti,
      data_scadenza: doc.data_scadenza || null,
      data_documento: doc.data_documento || null,
      stato: "bozza",
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ Errore salvataggio documento bozza:", error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

export interface ValidazioneDocumentoInput {
  documento_id: string;
  dati_validati: Record<string, unknown>;
  data_scadenza?: string | null;
  aggiorna_costo_config?: boolean; // true = aggiorna anche personale.costo_config
  personale_id?: string;
  costo_config?: Record<string, unknown>;
}

export async function validaEConfermaDocumento(
  input: ValidazioneDocumentoInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  // 1. Aggiorna documento come validato
  const { error: docError } = await supabase
    .from("personale_documenti")
    .update({
      dati_validati: input.dati_validati,
      data_scadenza: input.data_scadenza || null,
      stato: "validato",
    })
    .eq("id", input.documento_id);

  if (docError) {
    console.error("❌ Errore validazione documento:", docError);
    return { success: false, error: docError.message };
  }

  // 2. Opzionale: aggiorna costo_config del personale
  if (input.aggiorna_costo_config && input.personale_id && input.costo_config) {
    const { error: personaleError } = await supabase
      .from("personale")
      .update({ costo_config: input.costo_config })
      .eq("id", input.personale_id);

    if (personaleError) {
      console.warn("⚠️ Documento validato ma costo_config non aggiornato:", personaleError.message);
    }
  }

  return { success: true };
}

export async function getDocumentiPersonale(personale_id: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale_documenti")
    .select("*")
    .eq("personale_id", personale_id)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data || [];
}

// ============================================================
// SCADENZIARIO: Documenti in scadenza nei prossimi N giorni
// ============================================================

export interface DocumentoInScadenza {
  id: string;
  personale_id: string;
  personale_nome: string;
  personale_telefono: string | null;
  categoria_documento: string;
  data_scadenza: string;
  giorni_alla_scadenza: number;
  url_file: string | null;
}

export async function getDocumentiInScadenza(
  giorni: number = 30
): Promise<DocumentoInScadenza[]> {
  const supabase = getSupabaseAdmin();

  const oggi = new Date();
  const limite = new Date();
  limite.setDate(oggi.getDate() + giorni);

  const { data, error } = await supabase
    .from("personale_documenti")
    .select(`
      id,
      personale_id,
      categoria_documento,
      data_scadenza,
      url_file,
      personale!inner(nome, telefono)
    `)
    .not("data_scadenza", "is", null)
    .lte("data_scadenza", limite.toISOString().split("T")[0])
    .gte("data_scadenza", oggi.toISOString().split("T")[0])
    .eq("stato", "validato")
    .order("data_scadenza", { ascending: true });

  if (error || !data) return [];

  return data.map((d) => {
    const scadenza = new Date(d.data_scadenza);
    const diffMs = scadenza.getTime() - oggi.getTime();
    const giorniRimasti = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const p = d.personale as unknown as { nome: string; telefono: string | null };

    return {
      id: d.id,
      personale_id: d.personale_id,
      personale_nome: p.nome,
      personale_telefono: p.telefono,
      categoria_documento: d.categoria_documento,
      data_scadenza: d.data_scadenza,
      giorni_alla_scadenza: giorniRimasti,
      url_file: d.url_file,
    };
  });
}

// ============================================================
// CALCOLO COSTO REALE ORARIO (Motore Backend)
// Formula: Paga Oraria * (1 + INPS + INAIL + Edilcassa + TFR + Ferie)
// ============================================================

export interface CostoOrarioCalcolato {
  costo_base_orario: number;
  costo_reale_orario: number;     // Con tutti i contributi
  costo_straordinario_orario: number;
  trasferta_giornaliera: number;
  dettaglio: {
    paga_base: number;
    contributi_inps: number;
    contributi_inail: number;
    contributi_edilcassa: number;
    tfr: number;
    ferie_permessi: number;
  };
}

export function calcolaCostoOrario(
  costoConfig: Record<string, unknown>,
  parametriGlobali: Record<string, unknown>
): CostoOrarioCalcolato {
  // Legge da costo_config personale o usa defaults
  const pagaBase = (costoConfig.paga_base as number) || 0;
  const pagaTipo = (costoConfig.paga_base_tipo as string) || "oraria";
  const pagaOraria = pagaTipo === "mensile" ? pagaBase / 173 : pagaBase;

  const inps = (costoConfig.aliquota_inps as number) || 0.2315;
  const inail = (costoConfig.aliquota_inail as number) || 0.030;
  const edilcassa = (costoConfig.aliquota_edilcassa as number) || 0.020;
  const tfr = (costoConfig.tfr as number) || 0.0741;
  const ferie = (costoConfig.incidenza_ferie as number) || 0.1082;
  const maggiorazioneStr = (costoConfig.maggiorazione_straordinari as number) ||
    (parametriGlobali.maggiorazione_straordinari as number) || 1.25;

  const trasfertaGiornaliera = (costoConfig.trasferta_giornaliera as number) ||
    parseFloat(String(parametriGlobali.trasferta_indennita_giornaliera || "50"));

  const contributiPct = inps + inail + edilcassa + tfr + ferie;
  const costoReale = pagaOraria * (1 + contributiPct);
  const costoStraordinario = costoReale * maggiorazioneStr;

  return {
    costo_base_orario: Math.round(pagaOraria * 100) / 100,
    costo_reale_orario: Math.round(costoReale * 100) / 100,
    costo_straordinario_orario: Math.round(costoStraordinario * 100) / 100,
    trasferta_giornaliera: trasfertaGiornaliera,
    dettaglio: {
      paga_base: Math.round(pagaOraria * 100) / 100,
      contributi_inps: Math.round(pagaOraria * inps * 100) / 100,
      contributi_inail: Math.round(pagaOraria * inail * 100) / 100,
      contributi_edilcassa: Math.round(pagaOraria * edilcassa * 100) / 100,
      tfr: Math.round(pagaOraria * tfr * 100) / 100,
      ferie_permessi: Math.round(pagaOraria * ferie * 100) / 100,
    },
  };
}

// ============================================================
// CALCOLO DISTANZA (Haversine formula - Opzione B)
// Distanza in km tra due coordinate GPS
// ============================================================

export function calcolaDistanzaKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Raggio Terra in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function formatCantieriListForAI(cantieri: CantiereData[]): string {
  if (cantieri.length === 0) return "Nessun cantiere aperto trovato nel database.";

  const header = `DATI REALI DAL DATABASE (${cantieri.length} cantieri aperti):`;
  const rows = cantieri
    .map((c) => {
      let line = `- ${c.nome}: €${c.speso_totale.toLocaleString("it-IT")} spesi su €${c.budget_costi.toLocaleString("it-IT")} budget (${c.percentuale_costi}%, residuo €${c.residuo_budget.toLocaleString("it-IT")})`;
      if (c.valore_vendita > 0) {
        line += ` | Margine: €${c.margine.toLocaleString("it-IT")}`;
      }
      return line;
    })
    .join("\n");

  return `${header}\n${rows}`;
}