// ============================================================
// DATA FETCHER - Query Supabase per dati reali cantieri
// Usato dal webhook per fornire contesto reale a Gemini (RAG)
// e per inserire movimenti (DDT automatici)
//
// Legge da: vista_cantieri_budget (VIEW SQL)
// Scrive su: movimenti (tabella reale)
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

// ============================================================
// INFRASTRUTTURA: PAGINAZIONE CONDIVISA
// ============================================================
import { PaginationParams, PaginatedResult } from '@/types/pagination';

/**
 * Esegue una query Supabase aggiungendo i limiti di paginazione e recuperando il count totale.
 * @param queryBuilder La query Supabase pre-costruita (es: supabase.from('...').select('*', { count: 'exact' }).eq(...))
 * @param params Oggetto PaginationParams { page, pageSize }
 */
export async function executePaginatedQuery<T>(queryBuilder: any, params: PaginationParams): Promise<PaginatedResult<T>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.max(1, params.pageSize);
  
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Aggiungiamo i limiti di range alla query preesistente
  const { data, error, count } = await queryBuilder.range(from, to);

  if (error) {
    console.error("❌ Errore executePaginatedQuery:", error);
    throw new Error(`Errore query paginata: ${error.message}`);
  }

  const totalCount = count || 0;
  
  return {
    data: data as T[],
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize)
  };
}

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
  numero_documento?: string | null; 
}

// ============================================================
// RICERCA CANTIERE PER NOME (match parziale con ILIKE)
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
      numero_documento: movimento.numero_documento || null, 
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

export interface PersonaRisolta {
  personale: PersonaleData;
  nome_originale: string; 
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

export async function validaEConfermaDocumento(params: {
  documento_id: string;
  personale_id: string;
  dati_validati: Record<string, unknown>;
  data_scadenza?: string | null;
  costo_orario_reale?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

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

export async function getPrezziarioForRAG(descrizione: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  const parole = descrizione.split(/[\s,.'-]+/).filter(w => w.length > 3);
  const fallbackWord = parole.length > 0 ? parole[0] : descrizione.trim();

  const { data, error } = await supabase
    .from("prezziario_ufficiale_2025")
    .select("id, codice_tariffa, descrizione, unita_misura, prezzo_unitario")
    .ilike("descrizione", `%${fallbackWord}%`)
    .limit(10);

  if (error || !data || data.length === 0) {
    console.warn(`⚠️ Nessuna voce prezziario trovata per: "${fallbackWord}"`);
    return "";
  }

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

  return data
    .map(
      (i) =>
        `- Data: ${i.data_rilevazione} | Lavorazione: ${i.descrizione_lavorazione} | Costo Reale: €${i.costo_reale_unitario} / ${i.unita_misura}`
    )
    .join("\n");
}

export interface DocumentoCantiere {
  id: string;
  cantiere_id: string;
  nome_file: string;
  url_storage: string;
  categoria: string;
  data_scadenza: string | null;
  stato_scadenza: "Valido" | "In_Scadenza" | "Scaduto";
  note: string | null;
  scadenza_notificata: boolean;
  created_at: string;
  cantieri?: { nome: string };
}

export async function getDocumentiCantiere(cantiereId: string): Promise<DocumentoCantiere[]> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from("vista_cantiere_documenti")
    .select("*")
    .eq("cantiere_id", cantiereId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.warn(`⚠️ Nessun documento trovato per cantiere ${cantiereId}`);
    return [];
  }

  return data as DocumentoCantiere[];
}

export async function salvaDocumentoCantiere(params: {
  cantiere_id: string;
  nome_file: string;
  url_storage: string;
  categoria: string;
  data_scadenza?: string | null;
  note?: string | null;
  ai_dati_estratti?: Record<string, unknown> | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("cantiere_documenti")
    .insert({
      cantiere_id: params.cantiere_id,
      nome_file: params.nome_file,
      url_storage: params.url_storage,
      categoria: params.categoria,
      data_scadenza: params.data_scadenza || null,
      note: params.note || null,
      ai_dati_estratti: params.ai_dati_estratti || null,
      scadenza_notificata: false
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ Errore salvaDocumentoCantiere:", error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

export async function eliminaDocumentoCantiereRecord(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("cantiere_documenti")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("❌ Errore eliminaDocumentoCantiereRecord:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getDocumentiCantiereInScadenza(giorniAvviso = 30): Promise<DocumentoCantiere[]> {
  const supabase = getSupabaseAdmin();

  const oggi = new Date();
  const limite = new Date();
  limite.setDate(oggi.getDate() + giorniAvviso);

  const { data, error } = await supabase
    .from("vista_cantiere_documenti")
    .select(`
      *,
      cantieri!inner(nome)
    `)
    .not("data_scadenza", "is", null)
    .lte("data_scadenza", limite.toISOString().split("T")[0])
    .gte("data_scadenza", oggi.toISOString().split("T")[0])
    .eq("scadenza_notificata", false)
    .order("data_scadenza", { ascending: true });

  if (error || !data) {
    console.warn("⚠️ Nessun documento cantiere in scadenza trovato.");
    return [];
  }

  return data as DocumentoCantiere[];
}

export interface Soggetto {
  id: string;
  tipo: "fornitore" | "cliente";
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  email?: string;
  telefono?: string;
  pec?: string;
  codice_sdi?: string;
  iban?: string;
  condizioni_pagamento?: string;
  note?: string;
  created_at: string;
  auto_riconcilia?: boolean;
  categoria_riconciliazione?: string | null;
}

export async function getSoggetti(tipo?: string): Promise<Soggetto[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("anagrafica_soggetti")
    .select("*")
    .order("ragione_sociale", { ascending: true });

  if (tipo) {
    query = query.eq("tipo", tipo);
  }

  const { data, error } = await query;

  if (error) {
    console.error("❌ Errore getSoggetti:", error);
    return [];
  }

  return data as Soggetto[];
}

export async function getSoggettoById(id: string): Promise<Soggetto | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("anagrafica_soggetti")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.warn(`⚠️ Soggetto non trovato: ${id}`);
    return null;
  }

  return data as Soggetto;
}

export async function upsertSoggettoDaPIVA(
  piva: string,
  ragione_sociale: string,
  tipo: "fornitore" | "cliente"
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("anagrafica_soggetti")
    .upsert(
      { partita_iva: piva, ragione_sociale, tipo },
      { onConflict: "partita_iva" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("❌ Errore upsertSoggettoDaPIVA:", error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

export async function getKPIAnagrafiche(): Promise<{ fornitori: number; clienti: number; totale_debiti: number; totale_crediti: number }> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from("anagrafica_soggetti")
    .select("tipo");

  if (error || !data) return { fornitori: 0, clienti: 0, totale_debiti: 0, totale_crediti: 0 };

  const fornitori = data.filter((s: any) => s.tipo === 'fornitore').length;
  const clienti = data.filter((s: any) => s.tipo === 'cliente').length;

  // Calcola totale debiti (uscite non pagate) e crediti (entrate non pagate)
  const { data: scadenze } = await supabase
    .from("scadenze_pagamento")
    .select("tipo, importo_totale, importo_pagato")
    .in("stato", ["da_pagare", "parziale", "scaduto"]);

  let totale_debiti = 0;
  let totale_crediti = 0;
  if (scadenze) {
    for (const s of scadenze) {
      const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
      if (s.tipo === 'uscita') totale_debiti += residuo;
      else if (s.tipo === 'entrata') totale_crediti += residuo;
    }
  }

  return { fornitori, clienti, totale_debiti, totale_crediti };
}

export interface Scadenza {
  id: string;
  tipo: 'entrata' | 'uscita';
  soggetto_id: string;
  cantiere_id?: string;
  fattura_riferimento?: string;
  descrizione?: string;
  importo_totale: number;
  importo_pagato: number;
  importo_residuo: number; // Calcolato
  data_emissione?: string;
  data_scadenza: string;
  data_pagamento?: string;
  stato: 'da_pagare' | 'parziale' | 'pagato' | 'scaduto';
  metodo_pagamento?: string;
  note?: string;
  soggetto?: { ragione_sociale: string };
  cantiere?: { nome: string };
}

export interface KPIScadenze {
  da_incassare: number;
  da_pagare: number;
  scaduto: number;
  dso: number;
}

export async function getScadenze(filtri?: { 
  tipo?: string; 
  stato?: string; 
  cantiere_id?: string 
}): Promise<Scadenza[]> {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('scadenze_pagamento')
    .select(`
      *,
      soggetto:anagrafica_soggetti(ragione_sociale),
      cantiere:cantieri(id, nome)
    `);

  if (filtri?.tipo) query = query.eq('tipo', filtri.tipo);
  if (filtri?.stato) {
    if (filtri.stato === 'scaduto') {
      query = query.eq('stato', 'scaduto');
    } else {
      query = query.eq('stato', filtri.stato);
    }
  }
  if (filtri?.cantiere_id) query = query.eq('cantiere_id', filtri.cantiere_id);

  const { data, error } = await query.order('data_scadenza', { ascending: true });

  if (error) {
    console.error("❌ Errore getScadenze:", error);
    return [];
  }

  return (data || []).map(s => ({
    ...s,
    importo_residuo: s.importo_totale - s.importo_pagato
  })) as Scadenza[];
}

export async function getKPIScadenze(): Promise<KPIScadenze> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, stato, data_emissione, data_pagamento')
    .neq('stato', 'pagato');

  if (error) return { da_incassare: 0, da_pagare: 0, scaduto: 0, dso: 0 };

  const da_incassare = data
    .filter(s => s.tipo === 'entrata')
    .reduce((acc, s) => acc + (s.importo_totale - s.importo_pagato), 0);

  const da_pagare = data
    .filter(s => s.tipo === 'uscita')
    .reduce((acc, s) => acc + (s.importo_totale - s.importo_pagato), 0);

  const scaduto = data
    .filter(s => s.stato === 'scaduto')
    .reduce((acc, s) => acc + (s.importo_totale - s.importo_pagato), 0);

  const dso = await calcolaDSO();

  return { da_incassare, da_pagare, scaduto, dso };
}

export async function calcolaDSO(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const novantaGiorniFa = new Date();
  novantaGiorniFa.setDate(novantaGiorniFa.getDate() - 90);

  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('data_emissione, data_pagamento')
    .eq('tipo', 'entrata')
    .eq('stato', 'pagato')
    .gte('data_pagamento', novantaGiorniFa.toISOString().split('T')[0]);

  if (error || !data || data.length === 0) return 0;

  const diffs = data.map(s => {
    const emissione = new Date(s.data_emissione!).getTime();
    const pagamento = new Date(s.data_pagamento!).getTime();
    return (pagamento - emissione) / (1000 * 60 * 60 * 24);
  });

  const media = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.round(media);
}

export async function getAgingAnalysis() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, data_scadenza')
    .eq('tipo', 'entrata')
    .neq('stato', 'pagato');

  if (error || !data) return { f1: 0, f2: 0, f3: 0, f4: 0 };

  const oggi = new Date();
  const fasce = { f1: 0, f2: 0, f3: 0, f4: 0 }; 

  data.forEach(s => {
    const scadenza = new Date(s.data_scadenza);
    const diffGiorni = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));
    const residuo = s.importo_totale - s.importo_pagato;

    if (diffGiorni <= 30) fasce.f1 += residuo;
    else if (diffGiorni <= 60) fasce.f2 += residuo;
    else if (diffGiorni <= 90) fasce.f3 += residuo;
    else fasce.f4 += residuo;
  });

  return fasce;
}

export async function getKPIFinanziariGlob() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: params } = await supabase
    .from('parametri_globali')
    .select('saldo_iniziale_banca, soglia_alert_cassa')
    .single();

  const saldo_iniziale = params?.saldo_iniziale_banca || 0;
  const soglia_alert = params?.soglia_alert_cassa || 5000;

  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, stato');

  let fatturato = 0;
  let costi = 0;
  let cassa_attuale = saldo_iniziale;

  if (scadenze) {
    scadenze.forEach(s => {
      const pagato = Number(s.importo_pagato) || 0;
      const totale = Number(s.importo_totale) || 0;
      
      if (s.tipo === 'entrata') {
        fatturato += totale;
        cassa_attuale += pagato;
      } else if (s.tipo === 'uscita') {
        costi += totale;
        cassa_attuale -= pagato;
      }
    });
  }

  const margine = fatturato - costi;
  const dso = 30; 

  return { cassa_attuale, fatturato, costi, margine, dso, soglia_alert };
}

export async function getAgingAnalysisData(tipo: 'entrata' | 'uscita' = 'entrata') {
  const supabase = getSupabaseAdmin();
  const oggi = new Date();
  
  const { data } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, data_scadenza')
    .eq('tipo', tipo)
    .neq('stato', 'pagato')
    .lt('data_scadenza', oggi.toISOString().split('T')[0]);

  const fasce = {
    f30: { label: "0-30 gg", importo: 0, count: 0, color: tipo === 'entrata' ? "#eab308" : "#fbbf24" },
    f60: { label: "31-60 gg", importo: 0, count: 0, color: tipo === 'entrata' ? "#f97316" : "#f59e0b" },
    f90: { label: "61-90 gg", importo: 0, count: 0, color: tipo === 'entrata' ? "#ea580c" : "#ea580c" },
    fOltre: { label: "> 90 gg", importo: 0, count: 0, color: tipo === 'entrata' ? "#ef4444" : "#dc2626" }
  };

  if (data) {
    data.forEach(s => {
      const scadenza = new Date(s.data_scadenza);
      const diffGiorni = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));
      const residuo = (Number(s.importo_totale) || 0) - (Number(s.importo_pagato) || 0);

      if (diffGiorni <= 30) { fasce.f30.importo += residuo; fasce.f30.count++; }
      else if (diffGiorni <= 60) { fasce.f60.importo += residuo; fasce.f60.count++; }
      else if (diffGiorni <= 90) { fasce.f90.importo += residuo; fasce.f90.count++; }
      else { fasce.fOltre.importo += residuo; fasce.fOltre.count++; }
    });
  }

  return Object.values(fasce);
}

export async function getFinanzaPerCantiere() {
  const supabase = getSupabaseAdmin();
  
  const { data: cantieri } = await supabase
    .from('cantieri')
    .select(`id, nome, stato, percentuale_completamento, scadenze_pagamento ( tipo, importo_totale )`)
    .in('stato', ['attivo', 'pianificato']);

  if (!cantieri) return [];

  return cantieri.map(c => {
    let entrate = 0; let uscite = 0;
    c.scadenze_pagamento?.forEach((s: any) => {
      if (s.tipo === 'entrata') entrate += Number(s.importo_totale) || 0;
      if (s.tipo === 'uscita') uscite += Number(s.importo_totale) || 0;
    });
    return { id: c.id, nome: c.nome, completamento: c.percentuale_completamento || 0, entrate, uscite, margine: entrate - uscite };
  });
}

export async function getCashflowPrevisionale(giorni: number = 90) {
  const supabase = getSupabaseAdmin();
  const kpis = await getKPIFinanziariGlob();
  let cassaProgressiva = kpis.cassa_attuale;

  const oggi = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + giorni);

  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, data_scadenza')
    .neq('stato', 'pagato')
    .lte('data_scadenza', limite.toISOString().split('T')[0]);

  let debitiScaduti = 0;
  let creditiScaduti = 0;
  const timeline: Record<string, { entrate: number, uscite: number }> = {};

  if (scadenze) {
    scadenze.forEach(s => {
      const residuo = (Number(s.importo_totale) || 0) - (Number(s.importo_pagato) || 0);
      const dataScad = new Date(s.data_scadenza);

      if (dataScad < oggi) {
        if (s.tipo === 'entrata') creditiScaduti += residuo;
        if (s.tipo === 'uscita') debitiScaduti += residuo;
      } else {
        const dataStr = s.data_scadenza;
        if (!timeline[dataStr]) timeline[dataStr] = { entrate: 0, uscite: 0 };
        if (s.tipo === 'entrata') timeline[dataStr].entrate += residuo;
        if (s.tipo === 'uscita') timeline[dataStr].uscite += residuo;
      }
    });
  }

  cassaProgressiva = cassaProgressiva + creditiScaduti - debitiScaduti;

  const proiezioni: Array<{ data: string, saldo: number, entrate_giorno: number, uscite_giorno: number }> = [];
  
  proiezioni.push({
    data: oggi.toISOString().split('T')[0],
    saldo: cassaProgressiva,
    entrate_giorno: creditiScaduti,
    uscite_giorno: debitiScaduti
  });

  for (let i = 1; i <= giorni; i += 7) {
    const dataStep = new Date(oggi);
    dataStep.setDate(dataStep.getDate() + i);
    const dataStr = dataStep.toISOString().split('T')[0];
    
    let entratePeriodo = 0; let uscitePeriodo = 0;

    Object.keys(timeline).forEach(giorno => {
      const dataGiorno = new Date(giorno);
      const dataStepPrec = new Date(dataStep);
      dataStepPrec.setDate(dataStepPrec.getDate() - 7);
      
      if (dataGiorno > dataStepPrec && dataGiorno <= dataStep) {
        entratePeriodo += timeline[giorno].entrate;
        uscitePeriodo += timeline[giorno].uscite;
      }
    });

    cassaProgressiva += entratePeriodo - uscitePeriodo;

    proiezioni.push({
      data: dataStr,
      saldo: cassaProgressiva,
      entrate_giorno: entratePeriodo,
      uscite_giorno: uscitePeriodo
    });
  }

  return proiezioni;
}

// ============================================================
// STEP 5: RICONCILIAZIONE BANCARIA (PARSER CSV/XML E DB) 
// ============================================================

export function parseCSVBanca(csvText: string) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l !== '');
  const movimenti: Array<{ data_operazione: string; descrizione: string; importo: number; stato: string }> = [];

  console.log("📊 DEBUG CSV: Prime 3 righe rilevate:", lines.slice(0, 3));

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);

    if (cols.length < 3) {
      console.warn(`⚠️ Riga ${i} scartata: troppe poche colonne (${cols.length})`);
      continue;
    }

    const dataRaw = cols[0];
    let data_operazione = dataRaw;
    const sep = dataRaw.includes('/') ? '/' : '-';
    const parts = dataRaw.split(sep);
    if (parts.length === 3 && parts[0].length <= 2) {
      data_operazione = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }

    const importoRaw = cols[2] || '0';
    const importoPulito = importoRaw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const importo = parseFloat(importoPulito) || 0;

    const descrizione = cols[3]?.trim() || "Senza descrizione";

    if (importo !== 0) {
      movimenti.push({
        data_operazione,
        descrizione,
        importo,
        stato: 'non_riconciliato'
      });
    }
  }

  console.log(`✅ Analisi completata: ${movimenti.length} movimenti validi trovati nel CSV.`);
  return movimenti;
}

export function parseXMLBanca(xmlText: string) {
  // 1. Pulisci namespace per semplificare la vita al parser XML
  const cleanXml = xmlText
    .replace(/<\/?ns\d+:/g, (match) => match.replace(/ns\d+:/, ''))
    .replace(/\sxmlns[^"]*"[^"]*"/g, '');

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const jsonObj = parser.parse(cleanXml);
  const movimenti: any[] = [];

  // Navigazione dell'albero XML CBI
  const msg = jsonObj.CBIBdyBkToCstmrStmtReq?.CBIEnvelBkToCstmrStmtReqLogMsg?.CBIBkToCstmrStmtReqLogMsg?.CBIDlyStmtReqLogMsg || jsonObj.CBIDlyStmtReqLogMsg;
  if (!msg) return movimenti;

  let statements = msg.Stmt;
  if (!statements) return movimenti;
  if (!Array.isArray(statements)) statements = [statements];

  for (const stmt of statements) {
    let entries = stmt.Ntry;
    if (!entries) continue;
    if (!Array.isArray(entries)) entries = [entries];

    for (const entry of entries) {
      // Estrazione Importo e Segno
      const amtStr = entry.Amt?.['#text'] || entry.Amt;
      const amt = parseFloat(amtStr);
      if (isNaN(amt)) continue;

      const cdtDbtInd = entry.CdtDbtInd;
      const importo = cdtDbtInd === 'DBIT' ? -amt : amt;

      // Estrazione Data (BookgDt)
      const bookgDt = entry.BookgDt?.Dt;
      const data_operazione = bookgDt ? bookgDt.substring(0, 10) : new Date().toISOString().substring(0, 10);

      // Estrazione Info Dettagliate
      const txDtls = entry.NtryDtls?.TxDtls;
      let nm = '';
      let addtlTxInf = '';
      
      if (txDtls) {
          const dtlsArray = Array.isArray(txDtls) ? txDtls : [txDtls];
          for (const dtl of dtlsArray) {
              const cdtrNm = dtl.RltdPties?.Cdtr?.Nm;
              const dbtrNm = dtl.RltdPties?.Dbtr?.Nm;
              if (cdtrNm) nm = cdtrNm;
              else if (dbtrNm) nm = dbtrNm;
              
              if (dtl.AddtlTxInf) {
                  addtlTxInf = dtl.AddtlTxInf;
              }
          }
      }

      const descrizione = addtlTxInf || nm || "Movimento senza descrizione";

      // 4. ESTRAZIONE CAMPI STRUTTURATI da addtlTxInf (Metodo Robusto tramite Regex)
      const ibanMatch = addtlTxInf.match(/Iban beneficiario:([A-Z]{2}\d{2}[A-Z0-9]{11,30})/i) || addtlTxInf.match(/Iban ordinante:([A-Z]{2}\d{2}[A-Z0-9]{11,30})/i);
      const nomeMatch = addtlTxInf.match(/Nominativo beneficiario:([^C][^\n]+?)(?=Codice|Data|Indica|$)/i) || addtlTxInf.match(/Ragione sociale ordinante:([^C][^\n]+?)(?=Indirizzo|Identificativo|$)/i);
      const pivaMatch = addtlTxInf.match(/Partita Iva[^:]*:(\d{11})/i) || addtlTxInf.match(/Codice Fiscale[^:]*:(\d{11})/i);
      const causaleMatch = addtlTxInf.match(/Causale:([^\n]+?)(?=Esito|Importo|$)/i);
      const codeCBI = entry.BkTxCd?.Prtry?.Cd;

      movimenti.push({
        data_operazione,
        descrizione: descrizione.trim(),
        importo,
        stato: 'non_riconciliato',
        // Nuovi campi strutturati per l'AI
        xml_iban_controparte: ibanMatch ? ibanMatch[1].trim() : null,
        xml_nome_controparte: nomeMatch ? nomeMatch[1].trim() : (nm ? nm.trim() : null),
        xml_piva_controparte: pivaMatch ? pivaMatch[1].trim() : null,
        xml_causale: causaleMatch ? causaleMatch[1].trim() : null,
        xml_codice_cbi: codeCBI || null
      });
    }
  }

  console.log(`📦 XML CBI Parsato con successo: ${movimenti.length} movimenti trovati.`);
  return movimenti;
}

export async function getContiBanca() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conti_banca')
    .select('*')
    .eq('attivo', true)
    .order('nome_banca');
    
  if (error) console.error("❌ Errore getContiBanca:", error);
  return data || [];
}

export async function aggiornaSaldoConto(id: string, saldo: number, data_aggiornamento: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('conti_banca')
    .update({ saldo_attuale: saldo, saldo_aggiornato_al: data_aggiornamento })
    .eq('id', id);
    
  if (error) console.error("❌ Errore aggiornaSaldoConto:", error);
}

export async function creaContoBanca(params: { nome_banca: string, nome_conto: string, iban?: string, formato_csv?: string }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conti_banca')
    .insert({
      nome_banca: params.nome_banca,
      nome_conto: params.nome_conto,
      iban: params.iban || null,
      formato_csv: params.formato_csv || 'generico'
    })
    .select('id')
    .single();
    
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getUploadsBanca(contoId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('upload_banca')
    .select('*, conti_banca(nome_banca, nome_conto)')
    .order('data_upload', { ascending: false });
    
  if (contoId) query = query.eq('conto_banca_id', contoId);
  
  const { data, error } = await query;
  if (error) console.error("❌ Errore getUploadsBanca:", error);
  return data || [];
}

export async function creaUploadBancaRecord(params: {
  conto_banca_id: string,
  tipo: 'csv' | 'pdf_estratto',
  nome_file: string,
  url_storage: string,
  num_movimenti?: number,
  saldo_estratto?: number,
  data_riferimento?: string
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('upload_banca')
    .insert({
      conto_banca_id: params.conto_banca_id,
      tipo: params.tipo,
      nome_file: params.nome_file,
      url_storage: params.url_storage,
      num_movimenti: params.num_movimenti || 0,
      saldo_estratto: params.saldo_estratto || null,
      periodo_a: params.data_riferimento || null
    })
    .select('id')
    .single();
    
  if (error) throw new Error(error.message);
  return data.id;
}

export async function creaLogRiconciliazione(params: {
  movimento_id: string,
  scadenza_id: string,
  importo_applicato: number,
  tipo_match: 'auto_ai' | 'confermato_utente' | 'manuale' | 'split',
  ai_confidence?: number,
  ai_motivo?: string
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('riconciliazione_log')
    .insert({
      movimento_id: params.movimento_id,
      scadenza_id: params.scadenza_id,
      importo_applicato: params.importo_applicato,
      tipo_match: params.tipo_match,
      ai_confidence: params.ai_confidence || null,
      ai_motivo: params.ai_motivo || null
    });
    
  if (error) console.error("❌ Errore creaLogRiconciliazione:", error);
}

export async function importMovimentiBanca(movimenti: any[], conto_banca_id?: string, upload_id?: string) {
  const supabase = getSupabaseAdmin();
  
  const righe = movimenti.map(m => ({ 
    data_operazione: m.data_operazione,
    descrizione: m.descrizione,
    importo: m.importo,
    stato_riconciliazione: m.stato || 'non_riconciliato', // FIX 1: Colonna corretta
    conto_banca_id: conto_banca_id || m.conto_banca_id || null, // FIX 2: Passaggio ID Conto garantito
    upload_id: upload_id || null,
    xml_iban_controparte: m.xml_iban_controparte || null,
    xml_nome_controparte: m.xml_nome_controparte || null,
    xml_piva_controparte: m.xml_piva_controparte || null,
    xml_causale: m.xml_causale || null,
    xml_codice_cbi: m.xml_codice_cbi || null
  }));
  
  const { data, error } = await supabase
    .from('movimenti_banca')
    .insert(righe)
    .select();
    
  if (error) {
    console.error("Errore inserimento in DB:", error.message);
    throw new Error(error.message);
  }
  return data;
}

export async function getMovimentiNonRiconciliati(contoId?: string) {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('movimenti_banca')
    .select('*, conti_banca(nome_banca, nome_conto), anagrafica_soggetti(ragione_sociale)')
    .eq('stato_riconciliazione', 'non_riconciliato') // FIX: Usa stato_riconciliazione e non stato
    .order('data_operazione', { ascending: false });
    
  if (contoId) query = query.eq('conto_banca_id', contoId);
  
  const { data } = await query;
  return data || [];
}

export async function getScadenzeApertePerMatch(tipo: 'entrata' | 'uscita') {
  const supabase = getSupabaseAdmin();
  
  const { data } = await supabase
    .from('scadenze_pagamento')
    .select(`id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, soggetto_id, descrizione, anagrafica_soggetti(ragione_sociale)`)
    .eq('tipo', tipo)
    .neq('stato', 'pagato');
    
  return data || [];
}

export async function confermaRiconciliazione(
  movimento_id: string, 
  scadenza_id: string, 
  importo_movimento: number,
  tipo_match: 'auto_ai' | 'confermato_utente' | 'manuale' | 'split' = 'manuale',
  soggetto_id?: string,
  ai_confidence?: number,
  ai_motivo?: string
) {
  const supabase = getSupabaseAdmin();
  
  const updateData: any = { 
    stato: 'riconciliato', 
    scadenza_id: scadenza_id 
  };
  
  if (soggetto_id) updateData.soggetto_id = soggetto_id;
  if (tipo_match === 'auto_ai') updateData.auto_riconciliato = true;
  
  await supabase
    .from('movimenti_banca')
    .update(updateData)
    .eq('id', movimento_id);

  const { data: scadenza } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato')
    .eq('id', scadenza_id)
    .single();

  if (scadenza) {
    const nuovoPagato = (Number(scadenza.importo_pagato) || 0) + Math.abs(importo_movimento);
    const nuovoStato = nuovoPagato >= Number(scadenza.importo_totale) ? 'pagato' : 'parziale';
    
    await supabase
      .from('scadenze_pagamento')
      .update({
        importo_pagato: nuovoPagato,
        stato: nuovoStato,
        data_pagamento: new Date().toISOString().split('T')[0]
      })
      .eq('id', scadenza_id);
      
    await creaLogRiconciliazione({
      movimento_id,
      scadenza_id,
      importo_applicato: Math.abs(importo_movimento),
      tipo_match,
      ai_confidence,
      ai_motivo
    });
  }
}

export async function autoRiconciliaMovimenti(risultatiAI: any[]) {
  const autoRiconciliati: string[] = [];
  const daMostrare: any[] = [];
  const supabase = getSupabaseAdmin();
  
  for (const res of risultatiAI) {
    if (res.scadenza_id && res.confidence >= 0.98) {
      
      const { data: mov } = await supabase
        .from('movimenti_banca')
        .select('importo')
        .eq('id', res.movimento_id)
        .single();
        
      if (mov) {
        await confermaRiconciliazione(
          res.movimento_id, 
          res.scadenza_id, 
          mov.importo, 
          'auto_ai', 
          res.soggetto_id, 
          res.confidence, 
          res.motivo
        );
        autoRiconciliati.push(res.movimento_id);
        console.log(`⚡️ AUTO-RICONCILIATO Movimento ${res.movimento_id}`);
      } else {
        daMostrare.push(res);
      }
    } else {
      daMostrare.push(res); 
    }
  }
  
  return { autoRiconciliati, daMostrare };
}

export async function getStoricoPaymentsSoggetto(
  soggetto_id: string,
  pagination: PaginationParams
): Promise<PaginatedResult<any>> {
  const supabase = getSupabaseAdmin();

  // Costruiamo la query senza eseguirla (rimuovendo await)
  const query = supabase
    .from('movimenti_banca')
    .select(`
      id,
      data_operazione,
      descrizione,
      importo,
      stato,
      scadenza_id,
      scadenze_pagamento (
        fattura_riferimento,
        importo_totale
      )
    `, { count: 'exact' }) // Obbligatorio per la paginazione
    .eq('stato', 'riconciliato')
    .eq('soggetto_id', soggetto_id)
    .order('data_operazione', { ascending: false });

  // Deleghiamo l'esecuzione e il calcolo del count all'helper infrastrutturale
  return await executePaginatedQuery(query, pagination);
}

export async function getEsposizioneSoggetto(soggetto_id: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id);

  const info = { totale_fatture: 0, totale_pagato: 0, totale_da_pagare: 0, fatture_aperte: 0 };

  if (error || !data) {
    console.error("❌ Errore getEsposizioneSoggetto:", error);
    return info;
  }

  data.forEach(s => {
    const totale = Number(s.importo_totale) || 0;
    const pagato = Number(s.importo_pagato) || 0;

    info.totale_fatture += totale;
    info.totale_pagato += pagato;
    if (s.stato !== 'pagato') {
      info.fatture_aperte += 1;
    }
  });

  info.totale_da_pagare = info.totale_fatture - info.totale_pagato;

  return info;
}

export async function getFattureAperteSoggetto(
  soggetto_id: string,
  pagination: PaginationParams
): Promise<PaginatedResult<any>> {
  const supabase = getSupabaseAdmin();
  
  const query = supabase
    .from('scadenze_pagamento')
    .select('*', { count: 'exact' })
    .eq('soggetto_id', soggetto_id)
    .neq('stato', 'pagato')
    .order('data_scadenza', { ascending: true });
    
  return await executePaginatedQuery(query, pagination);
}

export function normalizzaNome(nome: string): string {
  if (!nome) return '';
  return nome
    .toLowerCase()
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?c\.?r\.?l\.?|di|e|&)\b/gi, ' ')
    .replace(/[^a-z0-9]/g, ' ')  
    .replace(/\s+/g, ' ')
    .trim();
}

export async function preMatchMovimenti(movimenti: any[], scadenzeAperte: any[], soggetti: any[], personale: any[] = [], conti_banca: any[] = []) {
  const matchati: any[] = [];
  const nonMatchati: any[] = [];

  console.log(`\n🔍 INIZIO PRE-MATCH DETERMINISTICO su ${movimenti.length} movimenti.`);

  for (const m of movimenti) {
    let matched = false;
    const causaleRaw = m.descrizione || '';
    const causale = causaleRaw.toUpperCase();
    
    // Normalizzazione standard e rimozione totale spazi (FIX 4B)
    const causaleNorm = normalizzaNome(causale);
    const causaleNoSpazi = causaleNorm.replace(/\s/g, ''); 

    // ==========================================
    // ZERO. Pre-Filtro Costi Bancari e Tasse
    // ==========================================
    const regexBanca = /\b(bollo|comm\.?|commissioni?|canone|tenuta conto|spese|competenz[ea]|imposta|f24)\b/i;
    if (regexBanca.test(causale)) {
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.99,
        motivo: `Pre-match Veloce: Rilevata Spesa Bancaria/Imposta`,
        ragione_sociale: "Banca / Imposte (Spesa Interna)", categoria: 'commissione'
      });
      continue;
    }

    // ==========================================
    // 1. STEP STIPENDI: Match con tabella personale 
    // ==========================================
    const regexStipendio = /\b(stipendio|emolument[i]?|uniemens)\b/i;
    if (regexStipendio.test(causale) || (m.xml_causale && regexStipendio.test(m.xml_causale))) {
      let foundPersona = null;
      for (const p of personale) {
        const nomeNorm = normalizzaNome(p.nome || '');
        const paroleNome = nomeNorm.split(' ').filter(w => w.length > 2);
        const matchPersona = paroleNome.length > 0 && paroleNome.every(parola => causaleNorm.includes(parola));
        if (matchPersona) { foundPersona = p; break; }
      }
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: null,
        confidence: foundPersona ? 0.98 : 0.90,
        motivo: foundPersona ? `Stipendio identificato: ${foundPersona.nome}` : `Stipendio (dipendente non identificato)`,
        ragione_sociale: foundPersona ? foundPersona.nome : "Dipendente",
        categoria: 'stipendio', personale_id: foundPersona?.id || null
      });
      continue;
    }

    // ==========================================
    // 2. STEP GIROCONTI E CARTE DI CREDITO
    // ==========================================
    const regexGiroconto = /\b(giroconto|giro\s*(da|a|per|su)|addebito carta|carta del credito cooperativo|estratto conto carta)\b/i;
    let isGiroconto = regexGiroconto.test(causale) || (m.xml_causale && regexGiroconto.test(m.xml_causale));
    let controparteGiroconto = "";
    let contoMatchato = null;

    if (isGiroconto) {
      // Deduce la direzione matematica dal segno dell'importo
      const isUscita = m.importo < 0;
      const direzioneTesto = isUscita ? "Uscita verso" : "Entrata da";

      // Cerca la controparte nei conti salvati
      for (const c of conti_banca) {
        // FIX CRASH: Salta se non c'è nome_conto o se è lo stesso conto che stiamo analizzando
        if (!c.nome_conto || c.id === m.conto_banca_id) continue;

        // 1. Cerca numero carta finale (es. *288)
        const lastDigitsMatch = c.nome_conto.match(/\*(\d{3,4})/);
        if (lastDigitsMatch && causale.includes(lastDigitsMatch[0])) {
          contoMatchato = c;
          break;
        }
        
        // 2. Cerca per nome del conto o della banca testuale
        const nomeContoNorm = normalizzaNome(c.nome_conto);
        const nomeBancaNorm = normalizzaNome(c.nome_banca);
        
        if ((nomeContoNorm.length > 3 && causaleNorm.includes(nomeContoNorm)) || 
            (nomeBancaNorm && nomeBancaNorm.length >= 3 && causaleNorm.includes(nomeBancaNorm))) {
          contoMatchato = c;
          break;
        }

        // 3. Cerca incrociando l'IBAN
        if (c.iban) {
          const ibanCercato = c.iban.replace(/\s/g, '').toUpperCase();
          if (causale.replace(/\s/g, '').includes(ibanCercato) || 
             (m.xml_iban_controparte && m.xml_iban_controparte.replace(/\s/g, '').toUpperCase() === ibanCercato)) {
            contoMatchato = c;
            break;
          }
        }
      }

      if (contoMatchato) {
        // Formattazione specifica se riconosce che è una carta
        if (contoMatchato.tipo_conto === 'credito' || contoMatchato.tipo_conto === 'prepagata') {
          controparteGiroconto = isUscita 
            ? `Addebito saldo su ${contoMatchato.nome_banca} (${contoMatchato.nome_conto})` 
            : `Ricarica/Storno da ${contoMatchato.nome_banca} (${contoMatchato.nome_conto})`;
        } else {
          // Formattazione per giroconto classico tra banche
          controparteGiroconto = `Giroconto: ${direzioneTesto} ${contoMatchato.nome_banca} - ${contoMatchato.nome_conto}`;
        }
      } else {
        // Nessun conto interno matchato, tenta con i dati XML/Testo grezzi
        let ibanTrovato = m.xml_iban_controparte || causale.match(/\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b/i)?.[0];
        if (ibanTrovato) {
          controparteGiroconto = `Giroconto: ${direzioneTesto} IBAN ${ibanTrovato}`;
        } else if (m.xml_nome_controparte) {
          controparteGiroconto = `Giroconto: ${direzioneTesto} ${m.xml_nome_controparte}`;
        } else {
          controparteGiroconto = `Giroconto (${direzioneTesto} controparte non identificata)`;
        }
      }

      matchati.push({
        movimento_id: m.id, 
        scadenza_id: null, 
        soggetto_id: null, 
        confidence: 0.99,
        motivo: controparteGiroconto.trim(), 
        ragione_sociale: contoMatchato ? `${contoMatchato.nome_banca} ${contoMatchato.nome_conto}` : "Giroconto / Carta", 
        categoria: 'giroconto'
      });
      continue;
    }

    // ==========================================
    // 3. STEP SOGGETTI SPECIALI: Leasing, PagoPA, Casse Edili
    // Match rapido per chi ha auto_riconcilia = true
    // ==========================================
    const soggettiSpeciali = soggetti.filter(s => s.auto_riconcilia === true);
    let specialMatched = false;

    for (const spec of soggettiSpeciali) {
      // Controllo IBAN
      if (spec.iban) {
        const ibanSpec = spec.iban.replace(/\s/g, '').toUpperCase();
        const ibanInCausale = causale.replace(/\s/g, '').includes(ibanSpec);
        const ibanInXml = m.xml_iban_controparte && m.xml_iban_controparte.replace(/\s/g, '').toUpperCase() === ibanSpec;
        
        if (ibanInCausale || ibanInXml) {
          matchati.push({
            movimento_id: m.id, scadenza_id: null, soggetto_id: spec.id, confidence: 0.99,
            motivo: `Auto-match Speciale: ${spec.ragione_sociale} via IBAN`,
            ragione_sociale: spec.ragione_sociale, categoria: spec.categoria_riconciliazione || 'sepa'
          });
          specialMatched = true;
          break;
        }
      }
      
      // Controllo NOME
      if (!specialMatched) {
        const nomeSpec = normalizzaNome(spec.ragione_sociale || '');
        if (nomeSpec.length >= 4) {
          const nomeNoSpazi = nomeSpec.replace(/\s/g, '');
          if (causaleNorm.includes(nomeSpec) || causaleNoSpazi.includes(nomeNoSpazi)) {
            matchati.push({
              movimento_id: m.id, scadenza_id: null, soggetto_id: spec.id, confidence: 0.99,
              motivo: `Auto-match Speciale: ${spec.ragione_sociale} via Nome`,
              ragione_sociale: spec.ragione_sociale, categoria: spec.categoria_riconciliazione || 'sepa'
            });
            specialMatched = true;
            break;
          }
        }
      }
    }

    // Se è un soggetto speciale, abbiamo finito con questo movimento
    if (specialMatched) {
      continue;
    }

    let foundSoggetto: any = null;
    let foundScadenza: any = null;

    // ==========================================
    // STEP XML: MATCH DAI CAMPI STRUTTURATI XML
    // ==========================================
    if (m.xml_iban_controparte) {
      const ibanCercato = m.xml_iban_controparte.replace(/\s/g, '').toUpperCase();
      const soggettoTrovato = soggetti.find(s => s.iban && s.iban.replace(/\s/g, '').toUpperCase() === ibanCercato);
      if (soggettoTrovato) {
        foundSoggetto = soggettoTrovato;
        console.log(`   💎 XML Match: IBAN ${ibanCercato} → ${soggettoTrovato.ragione_sociale}`);
      }
    }

    if (!foundSoggetto && m.xml_piva_controparte) {
      const pivaCercata = m.xml_piva_controparte.trim();
      const soggettoTrovato = soggetti.find(s => s.partita_iva === pivaCercata);
      if (soggettoTrovato) {
        foundSoggetto = soggettoTrovato;
        console.log(`   💎 XML Match: P.IVA ${pivaCercata} → ${soggettoTrovato.ragione_sociale}`);
      }
    }

    if (!foundSoggetto && m.xml_nome_controparte) {
      const nomeXml = normalizzaNome(m.xml_nome_controparte);
      for (const s of soggetti) {
        const nomeDb = normalizzaNome(s.ragione_sociale);
        if (nomeDb.length >= 4 && (nomeXml.includes(nomeDb) || nomeDb.includes(nomeXml))) {
          foundSoggetto = s;
          console.log(`   💎 XML Match: Nome '${m.xml_nome_controparte}' → ${s.ragione_sociale}`);
          break;
        }
      }
    }

    // ==========================================
    // STEP 0: NINJA MATCH GLOBALE FATTURA
    // ==========================================
    if (!foundScadenza) {
      for (const s of scadenzeAperte) {
        if (!s.fattura_riferimento || s.fattura_riferimento.trim().length < 4) continue;
        const fatturaRif = s.fattura_riferimento.toUpperCase();
        if (causale.includes(fatturaRif) || (m.xml_causale && m.xml_causale.toUpperCase().includes(fatturaRif))) {
          foundScadenza = s;
          foundSoggetto = soggetti.find(sog => sog.id === s.soggetto_id) || null;
          console.log(`   🥷 NINJA MATCH! Trovata fattura esatta: ${fatturaRif}`);
          break;
        }
      }
    }

    if (!foundScadenza && !foundSoggetto) {
      // ==========================================
      // STEP 1: PARTITA IVA (Testo Grezzo)
      // ==========================================
      const pivaMatch = causale.match(/\b\d{11}\b/);
      if (pivaMatch) {
        foundSoggetto = soggetti.find(s => s.partita_iva === pivaMatch[0]);
      }

      // ==========================================
      // STEP 2: IBAN (Testo Grezzo)
      // ==========================================
      if (!foundSoggetto) {
        const ibanMatch = causale.match(/\bIT\d{2}[A-Z]\d{10}[A-Z0-9]{12}\b/i);
        if (ibanMatch) {
          foundSoggetto = soggetti.find(s => s.iban && s.iban.toUpperCase() === ibanMatch[0].toUpperCase());
        }
      }

      // ==========================================
      // STEP 3: RAGIONE SOCIALE (Testo Grezzo) - FIX 4A/4B IMPLEMENTATO
      // ==========================================
      if (!foundSoggetto) {
        for (const s of soggetti) {
          const nomeNorm = normalizzaNome(s.ragione_sociale);
          if (nomeNorm.length >= 4) {
            const nomeNoSpazi = nomeNorm.replace(/\s/g, ''); 
            // Controllo elastico: cerca sia la stringa normata sia quella collassata senza spazi
            if (causaleNorm.includes(nomeNorm) || causaleNoSpazi.includes(nomeNoSpazi)) {
              foundSoggetto = s;
              break;
            }
          }
        }
      }
    }

    // ==========================================
    // STEP 4: RICERCA SCADENZA SUL SOGGETTO TROVATO
    // ==========================================
    if (foundSoggetto && !foundScadenza) {
      const scadenzeSoggetto = scadenzeAperte.filter(s => s.soggetto_id === foundSoggetto.id);

      // FIX 4C: Regex Fattura Potenziata per tracciati CBI (es. FATTURA_0000...)
      const regexFattura = /(?:FATT\.?|FT\.?|FATTURA[_]?|FAT)\s*(?:N\.?\s*)?([A-Z]{0,3}\/?(?:\d{4}\/)?[\d]+)/gi;
      let fatturaMatch = regexFattura.exec(causale);
      // Rimuove gli zero iniziali estratti per matchare più facilmente (es. 000215 -> 215)
      let numeroFatturaEstratto = fatturaMatch ? fatturaMatch[1].replace(/^0+/, '') : null;

      if (numeroFatturaEstratto) {
        foundScadenza = scadenzeSoggetto.find(s => 
          s.fattura_riferimento && s.fattura_riferimento.toUpperCase().includes(numeroFatturaEstratto!.toUpperCase())
        );
      }

      if (!foundScadenza) {
        const importoAssoluto = Math.abs(m.importo);
        foundScadenza = scadenzeSoggetto.find(s => {
          const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
          return Math.abs(residuo - importoAssoluto) < 0.01;
        });
      }
    }

    // ==========================================
    // PREPARAZIONE RISULTATO (Con categorie SEPA/Entrata/Fattura originali)
    // ==========================================
    const isSepa = /\b(SDD|RID|SEPA|Richiesta Incasso)\b/i.test(causale) || (m.xml_causale && /\b(SDD|RID|SEPA)\b/i.test(m.xml_causale));

    if (foundScadenza && foundSoggetto) {
      matchati.push({
        movimento_id: m.id, scadenza_id: foundScadenza.id, soggetto_id: foundSoggetto.id,
        confidence: 0.99, motivo: `Pre-match: Fattura/Importo per '${foundSoggetto.ragione_sociale}'`,
        ragione_sociale: foundSoggetto.ragione_sociale, categoria: m.importo > 0 ? 'entrata' : 'fattura'
      });
      matched = true;
    } else if (foundSoggetto) {
      // NON MANDIAMO PIU ALL'AI I SOGGETTI TROVATI, LI SALVIAMO DIRETTAMENTE!
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: foundSoggetto.id,
        confidence: 0.85, motivo: `Pre-match: Trovato soggetto '${foundSoggetto.ragione_sociale}' ma senza scadenze chiare`,
        ragione_sociale: foundSoggetto.ragione_sociale, categoria: isSepa ? 'sepa' : (m.importo > 0 ? 'entrata' : 'fattura')
      });
      matched = true;
    }

    // Se alla fine di tutto non abbiamo matchato, va all'AI
    if (!matched) {
      nonMatchati.push(m);
    }
  } // <-- FINE DEL CICLO FOR

  console.log(`\n✅ RISULTATI PRE-MATCH: ${matchati.length} Risolti/Scartati, ${nonMatchati.length} all'AI.\n`);
  return { matchati, nonMatchati };
}

// ============================================================
// FASE 2: SCADENZIARIO - KPI
// ============================================================

export interface ScadenzeKPIs {
  daIncassare: number;
  daPagare: number;
  scaduto: number;
  daSmistare: number;
  dso: number;
}

export async function getScadenzeKPIs(): Promise<ScadenzeKPIs> {
  const supabase = getSupabaseAdmin();
  
  // Richiama la funzione RPC creata nella migrazione SQL
  const { data, error } = await supabase.rpc('get_scadenze_kpis');
  
  if (error) {
    console.error("❌ Errore getScadenzeKPIs:", error);
    return { daIncassare: 0, daPagare: 0, scaduto: 0, daSmistare: 0, dso: 0 };
  }
  
  return data as ScadenzeKPIs;
}

import { ScadenzaWithSoggetto } from '@/types/finanza';

// ============================================================
// FASE 2: SCADENZIARIO - QUERY PAGINATA
// ============================================================

export interface FiltriScadenze {
  tipo?: 'entrata' | 'uscita';
  stato?: string[]; // es. ['da_pagare', 'parziale']
  cantiere_id?: string | null; // null = Da Smistare (senza cantiere)
  categoria?: string;
  search?: string;
}

/**
 * Recupera le scadenze dal database applicando filtri dinamici e paginazione server-side.
 */
export async function getScadenzePaginated(
  filtri: FiltriScadenze,
  pagination: PaginationParams
): Promise<PaginatedResult<ScadenzaWithSoggetto>> {
  const supabase = getSupabaseAdmin();

  // 1. Costruiamo la base della query richiedendo anche il count esatto
  let query = supabase
    .from('scadenze_pagamento')
    .select(`
      *,
      anagrafica_soggetti:soggetto_id (ragione_sociale, partita_iva, iban),
      cantieri:cantiere_id (codice, nome)
    `, { count: 'exact' });

  // 2. Applichiamo i filtri dinamicamente
  if (filtri.tipo) {
    query = query.eq('tipo', filtri.tipo);
  }

  if (filtri.stato && filtri.stato.length > 0) {
    query = query.in('stato', filtri.stato);
  }

  if (filtri.cantiere_id !== undefined) {
    if (filtri.cantiere_id === null) {
      // Filtro per "Da Smistare": nessun cantiere assegnato
      query = query.is('cantiere_id', null);
    } else {
      query = query.eq('cantiere_id', filtri.cantiere_id);
    }
  }

  if (filtri.categoria) {
    query = query.eq('categoria', filtri.categoria);
  }

  if (filtri.search) {
    // Ricerca testuale su fattura o descrizione
    const searchTerm = `%${filtri.search}%`;
    query = query.or(`fattura_riferimento.ilike.${searchTerm},descrizione.ilike.${searchTerm}`);
  }

  // 3. Ordinamento (le scadenze più imminenti prima, se da pagare/incassare, altrimenti le più recenti)
  if (filtri.stato?.includes('pagato')) {
    query = query.order('data_pagamento', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('data_scadenza', { ascending: true });
  }

  // 4. Eseguiamo la query passando per l'helper di paginazione creato nello Step 0.4
  return await executePaginatedQuery<ScadenzaWithSoggetto>(query, pagination);
}

// ============================================================
// FASE 3: CASHFLOW PROJECTION
// ============================================================
import { addDays, startOfWeek, format, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';

export interface CashflowWeek {
  weekLabel: string;
  entrate: number;
  uscite: number;
  saldoPrevisto: number;
}

export interface CashflowProjection {
  saldoAttuale: number;
  weeks: CashflowWeek[];
  hasNegativeWeeks: boolean;
}

export async function getCashflowProjection(days = 90): Promise<CashflowProjection> {
  const supabase = getSupabaseAdmin();

  // 1. Recupero Saldo Attuale Totale (Somma dei conti attivi)
  const { data: conti } = await supabase.from('conti_banca').select('saldo_attuale');
  const saldoAttuale = conti?.reduce((acc, c) => acc + (Number(c.saldo_attuale) || 0), 0) || 0;

  // 2. Recupero Scadenze Aperte
  const endDate = addDays(new Date(), days).toISOString().split('T')[0];
  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, data_scadenza, stato')
    .neq('stato', 'pagato')
    .lte('data_scadenza', endDate);

  const safeScadenze = scadenze || [];

  // 3. Aggregazione per Settimana
  const weeksMap = new Map<string, { entrate: number; uscite: number }>();
  const today = new Date();

  // Pre-popoliamo le prossime 12 settimane per avere un grafico continuo
  for (let i = 0; i < (days / 7); i++) {
    const weekStart = startOfWeek(addDays(today, i * 7), { weekStartsOn: 1 });
    const label = `Sett ${format(weekStart, 'w')} (${format(weekStart, 'dd MMM', { locale: it })})`;
    weeksMap.set(label, { entrate: 0, uscite: 0 });
  }

  // Smistiamo le scadenze
  safeScadenze.forEach(s => {
    const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
    if (residuo <= 0) return;

    // Se è scaduta, la consideriamo come "impatto immediato" nella settimana corrente
    let dScadenza = new Date(s.data_scadenza);
    if (isBefore(dScadenza, today)) dScadenza = today;

    const weekStart = startOfWeek(dScadenza, { weekStartsOn: 1 });
    const label = `Sett ${format(weekStart, 'w')} (${format(weekStart, 'dd MMM', { locale: it })})`;

    if (weeksMap.has(label)) {
      const current = weeksMap.get(label)!;
      if (s.tipo === 'entrata') current.entrate += residuo;
      else current.uscite += residuo;
    }
  });

  // 4. Calcolo Saldo Progressivo
  let runningBalance = saldoAttuale;
  let hasNegativeWeeks = false;
  const weeks: CashflowWeek[] = [];

  Array.from(weeksMap.entries()).forEach(([weekLabel, vals]) => {
    runningBalance += vals.entrate;
    runningBalance -= vals.uscite;
    if (runningBalance < 0) hasNegativeWeeks = true;

    weeks.push({
      weekLabel,
      entrate: vals.entrate,
      uscite: vals.uscite,
      saldoPrevisto: runningBalance
    });
  });

  return { saldoAttuale, weeks, hasNegativeWeeks };
}

// ============================================================
// FASE 5: RICONCILIAZIONE E CONTI BANCA
// ============================================================

export interface ContoSummary {
  id: string;
  nome_banca: string;
  nome_conto: string;
  iban: string;
  saldo_attuale: number;
  saldo_aggiornato_al: string;
  movimenti_da_riconciliare: number;
  ultimo_upload_anno?: number;
  ultimo_upload_mese?: number;
}

/**
 * Recupera un riepilogo di tutti i conti correnti bancari, 
 * incrociando i dati con i movimenti da riconciliare e l'ultimo upload.
 */
export async function getContiSummary(): Promise<ContoSummary[]> {
  const supabase = getSupabaseAdmin();
  
  // 1. Recupero di tutti i conti attivi
  const { data: conti, error: errConti } = await supabase
    .from('conti_banca')
    .select('*')
    .eq('attivo', true)
    .order('nome_banca', { ascending: true });
    
  if (errConti || !conti) {
    console.error("❌ Errore recupero conti:", errConti);
    return [];
  }

  const summaries: ContoSummary[] = [];

  for (const conto of conti) {
    // 2. Conteggio movimenti non riconciliati (CORRETTO: usa stato_riconciliazione)
    const { count: daRiconciliare } = await supabase
      .from('movimenti_banca')
      .select('*', { count: 'exact', head: true })
      .eq('conto_banca_id', conto.id)
      .eq('stato_riconciliazione', 'non_riconciliato');

    // 3. Recupero info ultimo file caricato
    const { data: ultimoUpload } = await supabase
      .from('upload_banca')
      .select('anno, mese')
      .eq('conto_banca_id', conto.id)
      .order('anno', { ascending: false })
      .order('mese', { ascending: false })
      .limit(1)
      .single();

    summaries.push({
      id: conto.id,
      nome_banca: conto.nome_banca,
      nome_conto: conto.nome_conto,
      iban: conto.iban,
      saldo_attuale: conto.saldo_attuale || 0,
      saldo_aggiornato_al: conto.saldo_aggiornato_al,
      movimenti_da_riconciliare: daRiconciliare || 0,
      ultimo_upload_anno: ultimoUpload?.anno,
      ultimo_upload_mese: ultimoUpload?.mese
    });
  }

  return summaries;
}

/**
 * Recupera l'archivio degli upload mensili per un singolo conto e un anno specifico.
 */
export async function getUploadArchive(contoId: string, anno: number) {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('upload_banca')
    .select('*')
    .eq('conto_banca_id', contoId)
    .eq('anno', anno)
    .order('mese', { ascending: true });
    
  if (error) {
    console.error("❌ Errore recupero archivio upload:", error);
    return [];
  }
  
  return data;
}

/**
 * Recupera i movimenti bancari paginati per un singolo conto corrente.
 */
export async function getMovimentiPaginati(
  contoId: string,
  pagination: any, // Usiamo any qui per mantenere compatibilità con executePaginatedQuery senza dover importare tipi extra
  filtri?: { stato?: string; search?: string; mese?: number; anno?: number }
) {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('movimenti_banca')
    .select('*', { count: 'exact' })
    .eq('conto_banca_id', contoId);

  // CORRETTO: usa stato_riconciliazione
  if (filtri?.stato) {
    query = query.eq('stato_riconciliazione', filtri.stato);
  }
  
  if (filtri?.search) {
    query = query.ilike('descrizione', `%${filtri.search}%`);
  }
  
  // Se vogliamo filtrare per un mese esatto, calcoliamo il range di date
  if (filtri?.mese && filtri?.anno) {
    const startOfMonth = new Date(filtri.anno, filtri.mese - 1, 1).toISOString();
    const endOfMonth = new Date(filtri.anno, filtri.mese, 0, 23, 59, 59).toISOString();
    query = query.gte('data_operazione', startOfMonth).lte('data_operazione', endOfMonth);
  }

  // Ordiniamo dal più recente al più vecchio
  query = query.order('data_operazione', { ascending: false });

  return await executePaginatedQuery(query, pagination);
}

// ============================================================
// FASE 6: ANAGRAFICHE (PAGINAZIONE E RICERCA)
// ============================================================
interface SoggettoAnagrafica {
  id: string;
  ragione_sociale: string;
  tipo: string;
  partita_iva?: string;
  codice_fiscale?: string;
  email?: string;
  telefono?: string;
  indirizzo?: string;
  pec?: string;
  codice_sdi?: string;
  iban?: string;
  condizioni_pagamento?: string;
  note?: string;
  auto_riconcilia?: boolean;
  categoria_riconciliazione?: string;
}

export async function getAnagrafichePaginate(
  pagination: { page: number; pageSize: number },
  search?: string,
  tipo?: string
) {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('anagrafica_soggetti')
    .select('*', { count: 'exact' });

  if (search) {
    // Cerca nel nome, partita iva o codice fiscale
    query = query.or(`ragione_sociale.ilike.%${search}%,partita_iva.ilike.%${search}%,codice_fiscale.ilike.%${search}%`);
  }

  if (tipo) {
    query = query.eq('tipo', tipo);
  }

  query = query.order('ragione_sociale', { ascending: true });

  return await executePaginatedQuery<SoggettoAnagrafica>(query, pagination);
}