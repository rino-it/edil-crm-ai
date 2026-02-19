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
  budget_costi: number;       // budget previsto per le spese
  valore_vendita: number;     // valore appalto (quanto paga il cliente)
  speso_materiali: number;
  speso_manodopera: number;
  speso_totale: number;
  residuo_budget: number;     // budget_costi - speso_totale
  margine: number;            // valore_vendita - speso_totale
  percentuale_costi: number;  // % speso su budget_costi
  percentuale_margine: number; // % margine su valore_vendita
  stato: string;
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

// ============================================================
// PARAMETRI GLOBALI: Legge Knowledge Base (aliquote CCNL, ecc.)
// ============================================================

export interface ParametriGlobali {
  id: number;
  aliquote_ccnl: {
    inps: number;
    inail: number;
    edilcassa: number;
    tfr: number;
    ferie_permessi: number;
    livelli: Record<string, { paga_base: number; label: string }>;
  } | null;
  indennita_trasferta: number;
  soglia_km_trasferta: number;
  moltiplicatore_straordinario: number;
  soglia_ore_straordinario: number;
}

export async function getParametriGlobali(): Promise<ParametriGlobali | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("parametri_globali")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) {
    console.warn("⚠️ Parametri globali non trovati");
    return null;
  }
  return data as ParametriGlobali;
}

// ============================================================
// COSTO ORARIO REALE: Formula completa con aliquote CCNL
// costo_reale = paga_base × (1 + INPS + INAIL + Edilcassa + TFR + Ferie)
// ============================================================

export function calcolaCostoOrario(
  pagaBase: number,
  aliquote: {
    inps: number;
    inail: number;
    edilcassa: number;
    tfr: number;
    ferie_permessi: number;
  }
): number {
  const moltiplicatore =
    1 +
    aliquote.inps +
    aliquote.inail +
    aliquote.edilcassa +
    aliquote.tfr +
    aliquote.ferie_permessi;
  return Math.round(pagaBase * moltiplicatore * 100) / 100;
}

// ============================================================
// DISTANZA KM: Formula Haversine tra due coordinate GPS
// ============================================================

export function calcolaDistanzaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // raggio Terra in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // arrotonda a 1 decimale
}

// ============================================================
// DOCUMENTI PERSONALE: Interfacce
// ============================================================

export interface DocumentoPersonale {
  id: string;
  personale_id: string;
  nome_file: string;
  url_file: string;
  categoria: string;
  categoria_documento?: string;
  data_scadenza: string | null;
  scadenza_notificata: boolean;
  dati_estratti: Record<string, unknown> | null;
  dati_validati: Record<string, unknown> | null;
  stato: "bozza" | "validato" | "rifiutato";
  created_at: string;
}

// ============================================================
// DOCUMENTI PERSONALE: Salva bozza dopo analisi AI
// ============================================================

export async function salvaDocumentoBozza(params: {
  personale_id: string;
  nome_file: string;
  url_file: string;
  categoria: string;
  dati_estratti: Record<string, unknown>;
  data_scadenza?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale_documenti")
    .insert({
      personale_id: params.personale_id,
      nome_file: params.nome_file,
      url_file: params.url_file,
      categoria: params.categoria,
      categoria_documento: params.categoria,
      dati_estratti: params.dati_estratti,
      dati_validati: null,
      stato: "bozza",
      data_scadenza: params.data_scadenza || null,
      scadenza_notificata: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("❌ Errore salvaDocumentoBozza:", error);
    return { success: false, error: error?.message };
  }

  console.log(`✅ Documento bozza salvato: ${data.id}`);
  return { success: true, id: data.id };
}

// ============================================================
// DOCUMENTI PERSONALE: Valida e conferma (supervisione umana)
// Aggiorna costo_config su personale se è un contratto
// ============================================================

export async function validaEConfermaDocumento(params: {
  documento_id: string;
  personale_id: string;
  dati_validati: Record<string, unknown>;
  data_scadenza?: string | null;
  costo_orario_reale?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  // 1. Aggiorna il documento come validato
  const { error: docError } = await supabase
    .from("personale_documenti")
    .update({
      dati_validati: params.dati_validati,
      stato: "validato",
      data_scadenza: params.data_scadenza || null,
    })
    .eq("id", params.documento_id);

  if (docError) {
    console.error("❌ Errore validaDocumento:", docError);
    return { success: false, error: docError.message };
  }

  // 2. Se c'è un costo orario reale calcolato, aggiorna personale
  if (params.costo_orario_reale && params.costo_orario_reale > 0) {
    const { error: personaleError } = await supabase
      .from("personale")
      .update({
        costo_orario: params.costo_orario_reale,
        costo_config: params.dati_validati,
      })
      .eq("id", params.personale_id);

    if (personaleError) {
      console.warn("⚠️ Documento validato ma errore aggiornamento costo personale:", personaleError);
    } else {
      console.log(`✅ Costo orario aggiornato: €${params.costo_orario_reale}/h per personale ${params.personale_id}`);
    }
  }

  return { success: true };
}

// ============================================================
// DOCUMENTI PERSONALE: Lista documenti per persona
// ============================================================

export async function getDocumentiPersonale(
  personale_id: string
): Promise<DocumentoPersonale[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("personale_documenti")
    .select("*")
    .eq("personale_id", personale_id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.warn(`⚠️ Nessun documento per personale ${personale_id}`);
    return [];
  }

  return data as DocumentoPersonale[];
}

// ============================================================
// DOCUMENTI PERSONALE: Scadenziario (prossimi 30 giorni)
// ============================================================

export interface DocumentoInScadenza {
  id: string;
  personale_id: string;
  nome_personale: string;
  nome_file: string;
  categoria: string;
  data_scadenza: string;
  giorni_alla_scadenza: number;
}

export async function getDocumentiInScadenza(
  giorniAvviso = 30
): Promise<DocumentoInScadenza[]> {
  const supabase = getSupabaseAdmin();

  const oggi = new Date();
  const limite = new Date();
  limite.setDate(oggi.getDate() + giorniAvviso);

  const { data, error } = await supabase
    .from("personale_documenti")
    .select(`
      id,
      personale_id,
      nome_file,
      categoria,
      data_scadenza,
      personale!inner(nome)
    `)
    .eq("stato", "validato")
    .not("data_scadenza", "is", null)
    .lte("data_scadenza", limite.toISOString().split("T")[0])
    .gte("data_scadenza", oggi.toISOString().split("T")[0])
    .order("data_scadenza", { ascending: true });

  if (error || !data) {
    console.warn("⚠️ Errore getDocumentiInScadenza:", error);
    return [];
  }

  return data.map((d: Record<string, unknown>) => {
    const scadenza = new Date(d.data_scadenza as string);
    const diffMs = scadenza.getTime() - oggi.getTime();
    const giorni = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const personaleRecord = d.personale as { nome: string } | null;
    return {
      id: d.id as string,
      personale_id: d.personale_id as string,
      nome_personale: personaleRecord?.nome ?? "N/D",
      nome_file: d.nome_file as string,
      categoria: d.categoria as string,
      data_scadenza: d.data_scadenza as string,
      giorni_alla_scadenza: giorni,
    };
  });
}
// ============================================================
// PREVENTIVAZIONE INTELLIGENCE: Lettura DB per RAG
// ============================================================

export async function getPrezziarioForRAG(descrizione: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  // Estraiamo la parola più lunga come chiave di ricerca per il fallback
  const parole = descrizione.split(/[\s,.'-]+/).filter(w => w.length > 3);
  const fallbackWord = parole.length > 0 ? parole[0] : descrizione.trim();

  // Cerchiamo le voci che contengono in parte la descrizione
  const { data, error } = await supabase
    .from("prezziario_ufficiale_2025")
    .select("id, codice_tariffa, descrizione, unita_misura, prezzo_unitario")
    .ilike("descrizione", `%${fallbackWord}%`)
    .limit(10);

  if (error || !data || data.length === 0) {
    console.warn(`⚠️ Nessuna voce prezziario trovata per: "${fallbackWord}"`);
    return "";
  }

  // Formattazione per Gemini
  return data
    .map(
      (i) =>
        `[ID: ${i.id}] ${i.codice_tariffa} - ${i.descrizione} | UM: ${i.unita_misura} | Prezzo Ufficiale: €${i.prezzo_unitario}`
    )
    .join("\n");
}

export async function getStoricoForRAG(descrizione: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  const parole = descrizione.split(/[\s,.'-]+/).filter(w => w.length > 3);
  const fallbackWord = parole.length > 0 ? parole[0] : descrizione.trim();

  const { data, error } = await supabase
    .from("storico_costi_lavorazioni")
    .select("descrizione_lavorazione, unita_misura, costo_reale_unitario, data_rilevazione")
    .ilike("descrizione_lavorazione", `%${fallbackWord}%`)
    .order("data_rilevazione", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    return "";
  }

  // Formattazione per Gemini
  return data
    .map(
      (i) =>
        `- Data: ${i.data_rilevazione} | Lavorazione: ${i.descrizione_lavorazione} | Costo Reale: €${i.costo_reale_unitario} / ${i.unita_misura}`
    )
    .join("\n");
}