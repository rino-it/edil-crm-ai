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
import { categorizzaScadenza } from "@/utils/categorizza-scadenza";

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

// ============================================================
// INSERISCI FATTURA FORNITORE (da WhatsApp / estrazione AI)
// 1) Upsert soggetto
// 2) Deduplicazione su fatture_fornitori
// 3) Insert testata fattura + righe dettaglio
// 4) Calcolo scadenza + insert scadenze_pagamento
// ============================================================
export interface InserisciFatturaInput {
  fornitore: { ragione_sociale: string; partita_iva: string | null; codice_fiscale?: string }
  tipo_documento: string
  numero_fattura: string | null
  data_fattura: string | null
  importo_totale: number
  importo_imponibile?: number
  aliquota_iva?: number
  importo_iva?: number
  righe?: Array<{ descrizione: string; quantita: number; unita_misura: string; prezzo_unitario: number; importo: number }>
  condizioni_pagamento?: string | null
  ddt_riferimento?: string[] | null
  file_url?: string | null
  _soggetto_confermato_id?: string | null
}

export async function inserisciFatturaFornitore(data: InserisciFatturaInput): Promise<{ success: boolean; fattura_id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  try {
    // --- 1. Match soggetto SOLO per ragione_sociale (NO P.IVA per evitare match sbagliati) ---
    let soggettoId: string | null = null;
    let condizioniPag: string = '30gg DFFM'; // fallback
    const ragioneSociale = data.fornitore?.ragione_sociale?.trim();
    const piva = data.fornitore?.partita_iva?.replace(/\D/g, '');

    // Se il webhook ha già confermato il soggetto, usalo direttamente
    if (data._soggetto_confermato_id) {
      soggettoId = data._soggetto_confermato_id;
      const { data: s } = await supabase
        .from('anagrafica_soggetti')
        .select('condizioni_pagamento')
        .eq('id', soggettoId)
        .single();
      condizioniPag = s?.condizioni_pagamento || condizioniPag;
    } else if (ragioneSociale) {
      // Cerca match in anagrafica per ragione_sociale
      const { data: matches } = await supabase
        .from('anagrafica_soggetti')
        .select('id, ragione_sociale, condizioni_pagamento')
        .ilike('ragione_sociale', `%${ragioneSociale}%`)
        .limit(5);

      if (matches && matches.length === 1) {
        // Match unico → usa direttamente
        soggettoId = matches[0].id;
        condizioniPag = matches[0].condizioni_pagamento || condizioniPag;
      } else if (matches && matches.length > 1) {
        // Match multiplo → prendi il primo risultato
        soggettoId = matches[0].id;
        condizioniPag = matches[0].condizioni_pagamento || condizioniPag;
      } else {
        // Nessun match → crea nuovo soggetto
        const { data: created } = await supabase
          .from('anagrafica_soggetti')
          .insert({
            ragione_sociale: ragioneSociale,
            tipo: 'fornitore',
            partita_iva: (piva && piva.length === 11) ? piva : null,
          })
          .select('id')
          .single();
        if (created) soggettoId = created.id;
      }
    }

    // --- 2. Deduplicazione fattura ---
    if (data.numero_fattura) {
      let dupQuery = supabase
        .from('fatture_fornitori')
        .select('id')
        .eq('numero_fattura', data.numero_fattura);

      if (piva && piva.length === 11) {
        dupQuery = dupQuery.eq('piva_fornitore', piva);
      } else if (ragioneSociale) {
        dupQuery = dupQuery.ilike('ragione_sociale', ragioneSociale);
      }

      const { data: dup } = await dupQuery.limit(1).maybeSingle();

      if (dup) {
        return { success: false, error: `Fattura n.${data.numero_fattura} da ${ragioneSociale || piva || 'N/D'} già presente (id: ${dup.id})` };
      }
    }

    // --- 3. Insert testata fattura ---
    const { data: fattura, error: fatErr } = await supabase
      .from('fatture_fornitori')
      .insert({
        ragione_sociale: ragioneSociale || 'Fornitore sconosciuto',
        piva_fornitore: piva || null,
        numero_fattura: data.numero_fattura || 'N/D',
        data_fattura: data.data_fattura || new Date().toISOString().split('T')[0],
        importo_totale: data.importo_totale || 0,
        soggetto_id: soggettoId,
        tipo_documento: data.tipo_documento || 'fattura',
        importo_imponibile: data.importo_imponibile || null,
        aliquota_iva: data.aliquota_iva || null,
        importo_iva: data.importo_iva || null,
        file_url: data.file_url || null,
      })
      .select('id')
      .single();

    if (fatErr) {
      console.error('❌ Errore insert fattura:', fatErr);
      return { success: false, error: fatErr.message };
    }

    const fatturaId = fattura?.id;

    // --- 4. Insert righe dettaglio ---
    if (fatturaId && data.righe && data.righe.length > 0) {
      const righeRows = data.righe.map((r, i) => ({
        fattura_id: fatturaId,
        numero_linea: i + 1,
        descrizione: r.descrizione || '',
        quantita: r.quantita || 0,
        unita_misura: r.unita_misura || '',
        prezzo_totale: r.importo || 0,
        ddt_riferimento: data.ddt_riferimento?.join(',') || null,
      }));

      const { error: righeErr } = await supabase
        .from('fatture_dettaglio_righe')
        .insert(righeRows);

      if (righeErr) {
        console.warn('⚠️ Errore insert righe dettaglio:', righeErr.message);
        // Non blocchiamo — la testata è già stata salvata
      }
    }

    // --- 5. Calcolo data scadenza ---
    // Priorità: condizioni estratte dalla fattura → condizioni del soggetto → fallback +30gg
    const condizioniEffettive = data.condizioni_pagamento || condizioniPag;
    const dataFattura = data.data_fattura ? new Date(data.data_fattura) : new Date();
    let dataScadenza: Date;

    const matchGG = condizioniEffettive.match(/(\d+)\s*g/i);
    if (matchGG) {
      const giorniDilazione = parseInt(matchGG[1], 10);

      if (/dffm|fine\s*mese/i.test(condizioniEffettive)) {
        // DFFM: fine mese + giorni
        const fineMese = new Date(dataFattura.getFullYear(), dataFattura.getMonth() + 1, 0);
        dataScadenza = new Date(fineMese.getTime() + giorniDilazione * 24 * 60 * 60 * 1000);
      } else {
        dataScadenza = new Date(dataFattura.getTime() + giorniDilazione * 24 * 60 * 60 * 1000);
      }
    } else {
      // Fallback +30gg
      dataScadenza = new Date(dataFattura.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    const dataScadenzaStr = dataScadenza.toISOString().split('T')[0];

    // --- 6. Insert scadenza pagamento ---
    const { error: scadErr } = await supabase
      .from('scadenze_pagamento')
      .insert({
        tipo: 'uscita',
        soggetto_id: soggettoId,
        fattura_riferimento: data.numero_fattura || 'N/D',
        importo_totale: data.importo_totale || 0,
        importo_pagato: 0,
        data_emissione: data.data_fattura || new Date().toISOString().split('T')[0],
        data_scadenza: dataScadenzaStr,
        data_pianificata: dataScadenzaStr,
        stato: 'da_pagare',
        descrizione: `Fattura n. ${data.numero_fattura || 'N/D'} da ${ragioneSociale || 'Fornitore sconosciuto'}`,
        file_url: data.file_url || null,
      });

    if (scadErr) {
      console.warn('⚠️ Errore insert scadenza:', scadErr.message);
      // La fattura è già salvata, non blocchiamo
    }

    return { success: true, fattura_id: fatturaId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    console.error('🔥 Errore inserisciFatturaFornitore:', msg);
    return { success: false, error: msg };
  }
}

// ============================================================
// INSERISCI DOCUMENTO DI PAGAMENTO (utenze, multe, tasse, avvisi)
// NON crea record in fatture_fornitori — solo scadenze_pagamento
// ============================================================
export interface InserisciDocumentoInput {
  tipo_documento: string;
  emittente: string;
  numero_documento?: string | null;
  data_documento?: string | null;
  importo_totale: number;
  data_scadenza?: string | null;
  codice_pagamento?: string | null;
  descrizione_completa?: string;
  note?: string | null;
  file_url?: string | null;
  _soggetto_confermato_id?: string | null;
}

export async function inserisciDocumentoPagamento(data: InserisciDocumentoInput): Promise<{ success: boolean; scadenza_id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  try {
    // --- 1. Cerca o crea soggetto emittente ---
    let soggettoId: string | null = null;
    const emittente = data.emittente?.trim();

    // Se il webhook ha già confermato il soggetto, usalo direttamente
    if (data._soggetto_confermato_id) {
      soggettoId = data._soggetto_confermato_id;
    } else if (emittente) {
      const { data: existing } = await supabase
        .from('anagrafica_soggetti')
        .select('id')
        .ilike('ragione_sociale', `%${emittente}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        soggettoId = existing.id;
      } else {
        const { data: created } = await supabase
          .from('anagrafica_soggetti')
          .insert({ ragione_sociale: emittente, tipo: 'fornitore' })
          .select('id')
          .single();
        if (created) soggettoId = created.id;
      }
    }

    // --- 2. Mappa tipo_documento → categoria scadenza ---
    const CATEGORIA_MAP: Record<string, string> = {
      utenza: 'utenza',
      multa: 'multa',
      tassa: 'burocrazia',
      avviso_pagamento: 'burocrazia',
    };
    let categoria = CATEGORIA_MAP[data.tipo_documento] || null;

    // Fallback: usa categorizzaScadenza() se il tipo AI non è mappato
    if (!categoria) {
      categoria = categorizzaScadenza(data.descrizione_completa, emittente);
    }

    // --- 3. Calcola data scadenza ---
    let dataScadenzaStr: string;
    if (data.data_scadenza) {
      dataScadenzaStr = data.data_scadenza;
    } else {
      const base = data.data_documento ? new Date(data.data_documento) : new Date();
      const scad = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
      dataScadenzaStr = scad.toISOString().split('T')[0];
    }

    // --- 4. Costruisci note complete ---
    const noteComplete = [
      data.codice_pagamento ? `Codice pagamento: ${data.codice_pagamento}` : null,
      data.note,
    ].filter(Boolean).join(' | ') || null;

    // --- 5. Insert scadenza pagamento ---
    const { data: scadenza, error: scadErr } = await supabase
      .from('scadenze_pagamento')
      .insert({
        tipo: 'uscita',
        soggetto_id: soggettoId,
        fattura_riferimento: data.numero_documento || 'N/D',
        importo_totale: data.importo_totale || 0,
        importo_pagato: 0,
        data_emissione: data.data_documento || new Date().toISOString().split('T')[0],
        data_scadenza: dataScadenzaStr,
        data_pianificata: dataScadenzaStr,
        stato: 'da_pagare',
        categoria,
        descrizione: data.descrizione_completa || `${data.tipo_documento} - ${emittente || 'N/D'}`,
        file_url: data.file_url || null,
        note: noteComplete,
      })
      .select('id')
      .single();

    if (scadErr) {
      console.error('❌ Errore insert scadenza documento:', scadErr.message);
      return { success: false, error: scadErr.message };
    }

    return { success: true, scadenza_id: scadenza?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    console.error('🔥 Errore inserisciDocumentoPagamento:', msg);
    return { success: false, error: msg };
  }
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
  const supabase = getSupabaseAdmin();

  // 1. Cassa reale = somma saldi bancari
  const { data: conti } = await supabase
    .from('conti_banca')
    .select('saldo_attuale')
    .eq('attivo', true);
  const cassa_attuale = conti?.reduce((acc, c) => acc + (Number(c.saldo_attuale) || 0), 0) || 0;

  // 2. Scadenze aperte (non pagate) → importo RESIDUO
  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato')
    .neq('stato', 'pagato');

  let da_incassare = 0;
  let esposizione_fornitori = 0;

  if (scadenze) {
    scadenze.forEach(s => {
      const residuo = (Number(s.importo_totale) || 0) - (Number(s.importo_pagato) || 0);
      if (residuo <= 0) return;
      if (s.tipo === 'entrata') da_incassare += residuo;
      else if (s.tipo === 'uscita') esposizione_fornitori += residuo;
    });
  }

  // 3. Bilancio = ciò che ci devono + ciò che abbiamo - ciò che dobbiamo
  const bilancio_globale = da_incassare + cassa_attuale - esposizione_fornitori;

  // 4. DSO (invariato)
  let dso = 30;
  try { dso = await calcolaDSO(); } catch(e) {}

  return { cassa_attuale, da_incassare, esposizione_fornitori, bilancio_globale, dso };
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

export async function getCashflowProiezione() {
  const supabase = getSupabaseAdmin();
  const oggi = new Date();
  
  // 1. DATA ZERO: Cassa Reale di partenza
  const { data: conti } = await supabase.from('conti_banca').select('saldo_attuale').eq('attivo', true);
  const cassaIniziale = conti?.reduce((acc, c) => acc + (Number(c.saldo_attuale) || 0), 0) || 0;

  // 2. Recupero Scadenze Aperte (Entrate e Uscite) ordinate per data pianificata
  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, data_pianificata')
    .neq('stato', 'pagato')
    .order('data_pianificata', { ascending: true });

  // 3. Inizializzazione Secchielli (Buckets)
  const proiezione = {
    giorno_0: cassaIniziale, // Include lo scaduto
    giorni_30: cassaIniziale,
    giorni_60: cassaIniziale,
    giorni_90: cassaIniziale,
    giorni_120: cassaIniziale
  };

  if (!scadenze) return proiezione;

  let saldoProgressivo = cassaIniziale;

  scadenze.forEach((s: any) => {
    const importoAtteso = Number(s.importo_totale) - Number(s.importo_pagato || 0);
    const variazione = s.tipo === 'entrata' ? importoAtteso : -importoAtteso;
    
    const dataPianificata = new Date(s.data_pianificata);
    const diffGiorni = Math.ceil((dataPianificata.getTime() - oggi.getTime()) / (1000 * 3600 * 24));

    saldoProgressivo += variazione;

    // Distribuzione progressiva nei secchielli
    if (diffGiorni <= 0) proiezione.giorno_0 += variazione; // Scaduto = impatto immediato
    if (diffGiorni <= 30) proiezione.giorni_30 = saldoProgressivo;
    if (diffGiorni > 30 && diffGiorni <= 60) proiezione.giorni_60 = saldoProgressivo;
    if (diffGiorni > 60 && diffGiorni <= 90) proiezione.giorni_90 = saldoProgressivo;
    if (diffGiorni > 90 && diffGiorni <= 120) proiezione.giorni_120 = saldoProgressivo;
  });

  // Riallineamento a cascata per i periodi vuoti
  if (proiezione.giorni_30 === cassaIniziale && proiezione.giorno_0 !== cassaIniziale) proiezione.giorni_30 = proiezione.giorno_0;
  if (proiezione.giorni_60 === cassaIniziale) proiezione.giorni_60 = proiezione.giorni_30;
  if (proiezione.giorni_90 === cassaIniziale) proiezione.giorni_90 = proiezione.giorni_60;
  if (proiezione.giorni_120 === cassaIniziale) proiezione.giorni_120 = proiezione.giorni_90;

  return proiezione;
}

export async function getCashflowPrevisionale(giorni: number = 90): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  const dataInizio = new Date();
  dataInizio.setHours(0, 0, 0, 0);

  const dataFine = new Date(dataInizio);
  dataFine.setDate(dataFine.getDate() + giorni);

  // 1. DATA ZERO: Cassa Reale Attuale
  const { data: conti } = await supabase.from('conti_banca').select('saldo_attuale').eq('attivo', true);
  let saldoCorrente = conti?.reduce((acc, c) => acc + (Number(c.saldo_attuale) || 0), 0) || 0;

  // 2. Legge le scadenze NON PAGATE basandosi sulla DATA PIANIFICATA
  const { data: scadenze } = await supabase
    .from('scadenze_pagamento')
    .select('tipo, importo_totale, importo_pagato, data_pianificata, data_scadenza')
    .neq('stato', 'pagato')
    .order('data_pianificata', { ascending: true });

  if (!scadenze || scadenze.length === 0) return [{ data: dataInizio.toISOString().split('T')[0], saldo: saldoCorrente }];

  // 3. Giorno 0: solo items con data_pianificata esplicitamente impostata E passata
  // Fatture senza data_pianificata e scadute → parcheggio "Da Pianificare", escluse dalla proiezione
  const scadute = scadenze.filter(s =>
    s.data_pianificata && new Date(s.data_pianificata) < dataInizio
  );
  scadute.forEach(s => {
    const importo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
    saldoCorrente += s.tipo === 'entrata' ? importo : -importo;
  });

  const cashflow: any[] = [];
  const mappaGiorni: Record<string, { entrate: number, uscite: number }> = {};

  // Raggruppa per giorno futuro: solo items con data_pianificata esplicitamente impostata
  // Senza data_pianificata → parcheggio, esclusi dalla proiezione
  const future = scadenze.filter(s => s.data_pianificata && new Date(s.data_pianificata) >= dataInizio);
  future.forEach(s => {
    const dataIso = s.data_pianificata!.split('T')[0];
    if (!mappaGiorni[dataIso]) mappaGiorni[dataIso] = { entrate: 0, uscite: 0 };
    
    const importo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
    if (s.tipo === 'entrata') mappaGiorni[dataIso].entrate += importo;
    else mappaGiorni[dataIso].uscite += importo;
  });

  // Genera i punti per il grafico SVG
  for (let d = new Date(dataInizio); d <= dataFine; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const movimentiGiorno = mappaGiorni[dateStr] || { entrate: 0, uscite: 0 };
    
    saldoCorrente += movimentiGiorno.entrate;
    saldoCorrente -= movimentiGiorno.uscite;

    cashflow.push({
      data: dateStr,
      saldo: saldoCorrente,
      entrate_giorno: movimentiGiorno.entrate,
      uscite_giorno: movimentiGiorno.uscite
    });
  }

  return cashflow;
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

  // Aggiorna saldo_attuale del conto banca sommando il delta dei movimenti importati
  if (data && data.length > 0 && conto_banca_id) {
    const deltaImporto = data.reduce((sum: number, m: any) => sum + (Number(m.importo) || 0), 0);
    const { data: conto } = await supabase
      .from('conti_banca')
      .select('saldo_attuale')
      .eq('id', conto_banca_id)
      .single();
    if (conto) {
      await supabase
        .from('conti_banca')
        .update({
          saldo_attuale: (Number(conto.saldo_attuale) || 0) + deltaImporto,
          saldo_aggiornato_al: new Date().toISOString().split('T')[0]
        })
        .eq('id', conto_banca_id);
    }
  }

  return data;
}

export async function getMovimentiNonRiconciliati(contoId?: string) {
  const supabase = getSupabaseAdmin();
  
  let query = supabase
    .from('movimenti_banca')
    .select('*, anagrafica_soggetti(ragione_sociale)')
    .eq('stato_riconciliazione', 'non_riconciliato')
    .order('data_operazione', { ascending: false });
    
  if (contoId) query = query.eq('conto_banca_id', contoId);
  
  const { data } = await query;
  return enrichWithContiBanca(data || []);
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
  let resolvedSoggettoId = soggetto_id;

  if (!resolvedSoggettoId && scadenza_id) {
    const { data: scad } = await supabase
      .from('scadenze_pagamento')
      .select('soggetto_id')
      .eq('id', scadenza_id)
      .single();
    if (scad?.soggetto_id) resolvedSoggettoId = scad.soggetto_id;
  }
  
  const updateData: any = { 
    stato_riconciliazione: 'riconciliato', 
    scadenza_id: scadenza_id,
    categoria_dedotta: 'fattura'
  };
  
  if (resolvedSoggettoId) updateData.soggetto_id = resolvedSoggettoId;
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

    // ==========================================
    // POST-CONFERMA: Aggiorna rate_mutuo se collegata
    // ==========================================
    const { data: rataCollegata } = await supabase
      .from('rate_mutuo')
      .select('id')
      .eq('scadenza_id', scadenza_id)
      .single();

    if (rataCollegata) {
      await supabase
        .from('rate_mutuo')
        .update({
          stato: 'pagato',
          data_pagamento: new Date().toISOString().split('T')[0],
          movimento_banca_id: movimento_id,
        })
        .eq('id', rataCollegata.id);
      console.log(`🏦 Rata mutuo ${rataCollegata.id} marcata come pagata`);
    }

    // ==========================================
    // POST-CONFERMA: Aggiorna titolo se collegato
    // ==========================================
    const { data: titoloCollegato } = await supabase
      .from('titoli')
      .select('id')
      .eq('scadenza_id', scadenza_id)
      .single();

    if (titoloCollegato) {
      await supabase
        .from('titoli')
        .update({
          stato: 'pagato',
          data_pagamento: new Date().toISOString().split('T')[0],
          movimento_banca_id: movimento_id,
        })
        .eq('id', titoloCollegato.id);
      console.log(`📝 Titolo ${titoloCollegato.id} marcato come pagato`);
    }
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

  const { data: diretti, error: directError } = await supabase
    .from('movimenti_banca')
    .select(`
      id,
      data_operazione,
      descrizione,
      importo,
      stato_riconciliazione,
      categoria_dedotta,
      ai_motivo,
      note_riconciliazione,
      scadenza_id,
      scadenze_pagamento (
        fattura_riferimento,
        importo_totale
      )
    `)
    .eq('stato_riconciliazione', 'riconciliato')
    .eq('soggetto_id', soggetto_id);

  if (directError) {
    throw new Error(`Errore storico pagamenti soggetto (diretti): ${directError.message}`);
  }

  // movimenti_banca is a partitioned table — PostgREST cannot join it via FK embed.
  // Step 1: get log entries for split scadenze belonging to this soggetto
  const { data: splitLogs, error: splitError } = await supabase
    .from('riconciliazione_log')
    .select(`
      scadenza_id,
      movimento_id,
      importo_applicato,
      tipo_match,
      scadenze_pagamento!inner(
        soggetto_id,
        fattura_riferimento,
        importo_totale
      )
    `)
    .eq('tipo_match', 'split')
    .eq('scadenze_pagamento.soggetto_id', soggetto_id);

  if (splitError) {
    throw new Error(`Errore storico pagamenti soggetto (split): ${splitError.message}`);
  }

  // Step 2: fetch the actual movements separately
  const splitMovimentoIds = [...new Set((splitLogs || []).map((l: any) => l.movimento_id).filter(Boolean))];
  let splitMovimentiMap = new Map<string, any>();

  if (splitMovimentoIds.length > 0) {
    const { data: splitMovData } = await supabase
      .from('movimenti_banca')
      .select('id, data_operazione, descrizione, importo, stato_riconciliazione, categoria_dedotta, ai_motivo, note_riconciliazione')
      .in('id', splitMovimentoIds)
      .eq('stato_riconciliazione', 'riconciliato');

    for (const m of (splitMovData || [])) {
      splitMovimentiMap.set(m.id, m);
    }
  }

  const mergedMap = new Map<string, any>();

  for (const movimento of (diretti || [])) {
    mergedMap.set(movimento.id, movimento);
  }

  for (const item of (splitLogs || [])) {
    const mov = splitMovimentiMap.get((item as any).movimento_id);
    const scad = Array.isArray((item as any).scadenze_pagamento)
      ? (item as any).scadenze_pagamento[0]
      : (item as any).scadenze_pagamento;

    if (!mov?.id) continue;

    if (!mergedMap.has(mov.id)) {
      mergedMap.set(mov.id, {
        ...mov,
        scadenza_id: (item as any).scadenza_id || null,
        scadenze_pagamento: scad
          ? {
              fattura_riferimento: scad.fattura_riferimento,
              importo_totale: scad.importo_totale,
            }
          : null,
      });
    }
  }

  const allRows = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.data_operazione).getTime() - new Date(a.data_operazione).getTime()
  );

  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const totalCount = allRows.length;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  return {
    data: allRows.slice(from, to),
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

export async function getStoricoPagamentiPersonale(
  personale_id: string,
  pagination: PaginationParams
): Promise<PaginatedResult<any>> {
  const supabase = getSupabaseAdmin();

  const query = supabase
    .from('movimenti_banca')
    .select(`
      id,
      data_operazione,
      descrizione,
      importo,
      stato_riconciliazione,
      personale_id,
      categoria_dedotta,
      conto_banca_id,
      conti_banca (
        nome_banca,
        nome_conto
      )
    `, { count: 'exact' })
    .eq('personale_id', personale_id)
    .eq('stato_riconciliazione', 'riconciliato')
    .order('data_operazione', { ascending: false });

  return await executePaginatedQuery(query, pagination);
}

export async function getKPIPersonale(personale_id: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('importo, data_operazione')
    .eq('personale_id', personale_id)
    .eq('stato_riconciliazione', 'riconciliato')
    .order('data_operazione', { ascending: false });

  const kpi = {
    totale_pagato: 0,
    num_pagamenti: 0,
    ultimo_pagamento: null as string | null,
  };

  if (error || !data || data.length === 0) {
    if (error) console.error('❌ Errore getKPIPersonale:', error);
    return kpi;
  }

  kpi.totale_pagato = data.reduce((acc, row) => acc + Math.abs(Number(row.importo) || 0), 0);
  kpi.num_pagamenti = data.length;
  kpi.ultimo_pagamento = data[0]?.data_operazione || null;

  return kpi;
}

export async function getEsposizioneSoggetto(soggetto_id: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, stato')
    .eq('soggetto_id', soggetto_id);

  const info = {
    totale_fatture: 0,
    totale_pagato: 0,
    totale_da_pagare: 0,
    fatture_aperte: 0,
    totale_acconti: 0,
  };

  if (error || !data) {
    console.error("❌ Errore getEsposizioneSoggetto:", error);
  } else {
    data.forEach(s => {
      const totale = Number(s.importo_totale) || 0;
      const pagato = Number(s.importo_pagato) || 0;

      info.totale_fatture += totale;
      info.totale_pagato += pagato;
      if (s.stato !== 'pagato') {
        info.fatture_aperte += 1;
      }
    });
  }

  const { data: movimenti, error: movErr } = await supabase
    .from('movimenti_banca')
    .select('importo')
    .eq('soggetto_id', soggetto_id)
    .eq('stato_riconciliazione', 'riconciliato')
    .eq('categoria_dedotta', 'fattura');

  if (movErr) {
    console.error("❌ Errore calcolo acconti movimenti:", movErr);
  }

  const totaleMovimentiRiconciliati = (movimenti || []).reduce(
    (acc, m) => acc + Math.abs(Number(m.importo) || 0),
    0
  );

  info.totale_acconti = Math.max(
    0,
    Math.round((totaleMovimentiRiconciliati - info.totale_pagato) * 100) / 100
  );

  info.totale_da_pagare = Math.max(
    0,
    Math.round((info.totale_fatture - info.totale_pagato - info.totale_acconti) * 100) / 100
  );

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

// Mappa alias nomi commerciali → nomi legali (e viceversa)
// Usata per brand con nomi diversi tra database e XML bancari
const BRAND_ALIASES: Record<string, string[]> = {
  'tim':              ['telecom italia', 'telecomitalia', 'tim spa'],
  'telecom italia':   ['tim', 'tim spa', 'telecomitalia'],
  'enel':             ['enel energia', 'enel servizio elettrico', 'acea distribuzione'],
  'eni':              ['eni plenitude', 'eni gas e luce'],
  'q8':               ['kuwait petroleum', 'ip motor oil'],
  'kuwait petroleum': ['q8', 'q8 petroleum'],
  'vodafone':         ['vodafone italia', 'vodafone omnitel'],
  'fastweb':          ['fastweb spa', 'fastweb network'],
  'wind':             ['wind tre', 'windtre', '3 italia'],
  'windtre':          ['wind tre', 'wind', '3 italia'],
};

// Controlla se due nomi normalizzati matchano diretti o tramite alias
function matchNomeConAlias(nomeA: string, nomeB: string): boolean {
  if (nomeA.includes(nomeB) || nomeB.includes(nomeA)) return true;
  const aliasA = BRAND_ALIASES[nomeA] || [];
  const aliasB = BRAND_ALIASES[nomeB] || [];
  return aliasA.some(a => nomeB.includes(a) || a.includes(nomeB)) ||
         aliasB.some(a => nomeA.includes(a) || a.includes(nomeA));
}

// Normalizza riferimenti fattura per matching robusto (rimuove spazi, punti, slash, trattini)
function normalizzaRiferimentoFattura(valore: string): string {
  return (valore || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  const supabase = getSupabaseAdmin();

  console.log(`\n🔍 INIZIO PRE-MATCH DETERMINISTICO su ${movimenti.length} movimenti.`);

  for (const m of movimenti) {
    let matched = false;
    const causaleRaw = m.descrizione || '';
    const causale = causaleRaw.toUpperCase();
    
    // Normalizzazione standard e rimozione totale spazi (FIX 4B)
    const causaleNorm = normalizzaNome(causale);
    const causaleNoSpazi = causaleNorm.replace(/\s/g, ''); 

    // ==========================================
    // ZERO. Pre-Filtro Commissioni Bancarie Pure
    // ==========================================
    const regexBanca = /\b(bollo|comm\.?|commissioni?|canone|tenuta conto|spese\s+bancari[e]?|competenz[ea])\b/i;
    if (regexBanca.test(causale)) {
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.99,
        motivo: `Pre-match Veloce: Commissione Bancaria`,
        ragione_sociale: "Commissione Bancaria", categoria: 'commissione'
      });
      continue;
    }

    // ==========================================
    // 0.5. Pre-Filtro F24 / Tributi Erariali
    // ==========================================
    const regexF24 = /\b(delega unificata|mod\.?\s*f24|pag.*f24|f24\s|agenzia\s*(delle\s*)?entrate|tribut[io]\s+erariali?)\b/i;
    if (regexF24.test(causale) || (m.xml_causale && regexF24.test(m.xml_causale))) {
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.99,
        motivo: `Pre-match Veloce: F24 / Tributo Erariale`,
        ragione_sociale: "F24 / Erario", categoria: 'f24'
      });
      continue;
    }

    // ==========================================
    // 0.6. Pre-Filtro INTERESSI BANCARI
    // ==========================================
    const regexInteressi = /\b(interess[ie]\s+(fido|scoperto|conto|creditor|debitor|anno)|interess[ie]\s+su\s|interess[ie]\s+passiv[ie])\b/i;
    if (regexInteressi.test(causale) || (m.xml_causale && regexInteressi.test(m.xml_causale))) {
      matchati.push({
        movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.99,
        motivo: `Pre-match Veloce: Interessi Bancari`,
        ragione_sociale: "Interessi Bancari", categoria: 'interessi_bancari'
      });
      continue;
    }

    // ==========================================
    // 0.7. Pre-Filtro RATA MUTUO (con match rate_mutuo)
    // ==========================================
    const regexMutuo = /\b(rata\s+mutuo|mutuo\s+n|est\.?\s*mutuo|rimborso\s+mutuo|addeb.*mutuo)\b/i;
    const isMutuo = regexMutuo.test(causale) || (m.xml_causale && regexMutuo.test(m.xml_causale));

    if (isMutuo) {
      // Cerca la rata_mutuo corrispondente per importo e data
      const importoAbs = Math.abs(m.importo);
      const dataMov = m.data_operazione || m.data_valuta;

      const { data: rataMatch } = await supabase
        .from('rate_mutuo')
        .select('id, mutuo_id, numero_rata, importo_rata, data_scadenza, mutui!inner(banca_erogante, scopo)')
        .eq('stato', 'da_pagare')
        .gte('data_scadenza', new Date(new Date(dataMov).getTime() - 15 * 86400000).toISOString().slice(0, 10))
        .lte('data_scadenza', new Date(new Date(dataMov).getTime() + 15 * 86400000).toISOString().slice(0, 10))
        .order('data_scadenza', { ascending: true });

      let rataFound: any = null;
      if (rataMatch) {
        // Match per importo (tolleranza 1€ per spese incasso)
        rataFound = rataMatch.find((r: any) => Math.abs(r.importo_rata - importoAbs) <= 1.0);
      }

      if (rataFound) {
        const mutuoInfo = rataFound.mutui as any;
        matchati.push({
          movimento_id: m.id,
          scadenza_id: rataFound.scadenza_id || null,
          soggetto_id: null,
          confidence: 0.98,
          motivo: `Rata mutuo ${mutuoInfo?.banca_erogante || ''} ${mutuoInfo?.scopo || ''} - rata ${rataFound.numero_rata}`,
          ragione_sociale: mutuoInfo?.banca_erogante || 'Mutuo',
          categoria: 'rata_mutuo',
          rata_mutuo_id: rataFound.id,
        });
        continue;
      } else {
        // Mutuo generico senza match rata_mutuo specifico — lascia proseguire per soggetto match
      }
    }

    // ==========================================
    // 0.8. Pre-Filtro ASSEGNI e CAMBIALI (titoli)
    // ==========================================
    const regexAssegno = /\b(assegno|versamento\s+assegn[io]|incasso\s+assegn[io]|assegn[io]\s+n|a\/b\s+n)\b/i;
    const regexCambiale = /\b(cambiale|pagar[oò]|tratta|effett[io]\s+n|ri\.?ba\.?)\b/i;
    const isTitolo = regexAssegno.test(causale) || regexCambiale.test(causale) ||
      (m.xml_causale && (regexAssegno.test(m.xml_causale) || regexCambiale.test(m.xml_causale)));

    if (isTitolo && m.importo > 0) {
      // Solo incassi (entrate positive)
      const importoAbs = Math.abs(m.importo);
      const dataMov = m.data_operazione || m.data_valuta;

      const { data: titoloMatch } = await supabase
        .from('titoli')
        .select('id, tipo, importo, data_scadenza, numero_titolo, scadenza_id, anagrafica_soggetti(ragione_sociale)')
        .eq('stato', 'in_essere')
        .gte('data_scadenza', new Date(new Date(dataMov).getTime() - 30 * 86400000).toISOString().slice(0, 10))
        .lte('data_scadenza', new Date(new Date(dataMov).getTime() + 30 * 86400000).toISOString().slice(0, 10))
        .order('data_scadenza', { ascending: true });

      let titoloFound: any = null;
      if (titoloMatch) {
        // Match per importo esatto (tolleranza 0.50€)
        titoloFound = titoloMatch.find((t: any) => Math.abs(t.importo - importoAbs) <= 0.50);
      }

      if (titoloFound) {
        const sogg = titoloFound.anagrafica_soggetti as any;
        const tipoLabel = titoloFound.tipo === 'assegno' ? 'Assegno' : 'Cambiale';
        matchati.push({
          movimento_id: m.id,
          scadenza_id: titoloFound.scadenza_id || null,
          soggetto_id: null,
          confidence: 0.96,
          motivo: `${tipoLabel} ${titoloFound.numero_titolo ? '#' + titoloFound.numero_titolo : ''} ${sogg?.ragione_sociale || ''}`.trim(),
          ragione_sociale: sogg?.ragione_sociale || tipoLabel,
          categoria: 'titolo',
          titolo_id: titoloFound.id,
        });
        continue;
      }
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
    const regexGiroconto = /\b(giroconto|giro\s*(da|a|per|su)|addebito carta|carta del credito cooperativo|estratto conto carta|ricarica\s+carta|add\.?\s*pagam\.?\s*diversi\s*ricarica)\b/i;
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
        
        // 1bis. Cerca numero carta in formato mascherato (es. 4691XXXXXXXX5396 → ultime 4: 5396)
        if (!contoMatchato) {
          const maskedCardMatch = causale.match(/\d{4}X{4,}(\d{4})/i);
          if (maskedCardMatch) {
            const ultimeCifre = maskedCardMatch[1];
            if (c.nome_conto && c.nome_conto.includes(ultimeCifre)) {
              contoMatchato = c;
              break;
            }
          }
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

      // Distingui carte di credito/prepagate da semplici giroconti
      const categoriaGiro = contoMatchato &&
        (contoMatchato.tipo_conto === 'credito' || contoMatchato.tipo_conto === 'prepagata')
          ? 'carta_credito'
          : 'giroconto';

      matchati.push({
        movimento_id: m.id, 
        scadenza_id: null, 
        soggetto_id: null, 
        confidence: 0.99,
        motivo: controparteGiroconto.trim(), 
        ragione_sociale: contoMatchato ? `${contoMatchato.nome_banca} ${contoMatchato.nome_conto}` : "Giroconto / Carta", 
        categoria: categoriaGiro
      });
      continue;
    }

    // ==========================================
    // 2.5. SELF-TRANSFER DETECTION (Bonifici da/verso nostri conti)
    // ==========================================
    if (!matched) {
      for (const c of conti_banca) {
        if (c.id === m.conto_banca_id) continue;

        // Cerca IBAN nostro nella causale
        if (c.iban) {
          const nostroIban = c.iban.replace(/\s/g, '').toUpperCase();
          if (causale.replace(/\s/g, '').includes(nostroIban) ||
              (m.xml_iban_controparte && m.xml_iban_controparte.replace(/\s/g, '').toUpperCase() === nostroIban)) {
            const isUscita = m.importo < 0;
            matchati.push({
              movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.99,
              motivo: `Giroconto: ${isUscita ? 'Uscita verso' : 'Entrata da'} ${c.nome_banca} - ${c.nome_conto}`,
              ragione_sociale: `${c.nome_banca} ${c.nome_conto}`, categoria: 'giroconto'
            });
            matched = true;
            break;
          }
        }

        // Cerca parole lunghe ≥5 char del nome conto nella causale
        const nomiParts = normalizzaNome(c.nome_conto || '').split(' ');
        for (const parte of nomiParts) {
          if (parte.length >= 5 && causaleNorm.includes(parte)) {
            const isUscita = m.importo < 0;
            matchati.push({
              movimento_id: m.id, scadenza_id: null, soggetto_id: null, confidence: 0.95,
              motivo: `Giroconto (probabile): ${isUscita ? 'Uscita verso' : 'Entrata da'} ${c.nome_banca} (match: "${parte}")`,
              ragione_sociale: `${c.nome_banca} ${c.nome_conto}`, categoria: 'giroconto'
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) continue;
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
        // Soglia 3 (non 4) per catturare brand corti come "TIM"
        if (nomeDb.length >= 3 && matchNomeConAlias(nomeXml, nomeDb)) {
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
      const causalePerMatchFattura = normalizzaRiferimentoFattura(`${causale} ${m.xml_causale || ''}`);
      for (const s of scadenzeAperte) {
        if (!s.fattura_riferimento || s.fattura_riferimento.trim().length < 4) continue;
        const fatturaRif = s.fattura_riferimento.toUpperCase();
        const fatturaRifNorm = normalizzaRiferimentoFattura(fatturaRif);
        if ((causale.includes(fatturaRif) || (m.xml_causale && m.xml_causale.toUpperCase().includes(fatturaRif))) ||
            (fatturaRifNorm.length >= 4 && causalePerMatchFattura.includes(fatturaRifNorm))) {
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
          // Soglia 3 (non 4) per catturare brand corti come "TIM"
          if (nomeNorm.length >= 3) {
            const nomeNoSpazi = nomeNorm.replace(/\s/g, ''); 
            // Controllo elastico: cerca la stringa normata, quella senza spazi, o alias di brand
            if (causaleNorm.includes(nomeNorm) || causaleNoSpazi.includes(nomeNoSpazi) ||
                matchNomeConAlias(causaleNorm, nomeNorm)) {
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
      const causalePerMatchFattura = normalizzaRiferimentoFattura(`${causale} ${m.xml_causale || ''}`);

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

      // STEP 4a-bis: match diretto robusto del fattura_riferimento nella causale normalizzata
      if (!foundScadenza) {
        foundScadenza = scadenzeSoggetto.find(s => {
          if (!s.fattura_riferimento || s.fattura_riferimento.trim().length < 4) return false;
          const rifNorm = normalizzaRiferimentoFattura(s.fattura_riferimento);
          return rifNorm.length >= 4 && causalePerMatchFattura.includes(rifNorm);
        });
      }

      if (!foundScadenza) {
        const importoAssoluto = Math.abs(m.importo);
        const tolleranzaImporto = 0.5; // gestisce micro-differenze dovute a arrotondamenti/commissioni
        foundScadenza = scadenzeSoggetto.find(s => {
          const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
          return Math.abs(residuo - importoAssoluto) <= tolleranzaImporto;
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
  scadenzaEntroGiorni?: number; // mostra scaduti + da pagare/parziale con scadenza entro N giorni da oggi
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

  if (filtri.scadenzaEntroGiorni !== undefined) {
    // Mostra: tutti gli scaduti (qualunque data) + da_pagare/parziale con scadenza entro N giorni
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + filtri.scadenzaEntroGiorni);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    // scaduto: data_scadenza < oggi  |  da_pagare/parziale: data_scadenza <= maxDate
    query = query.or(`stato.eq.scaduto,data_scadenza.lte.${maxDateStr}`);
  }

  if (filtri.search) {
    // Ricerca testuale su soggetto, fattura o descrizione
    const searchTerm = `%${filtri.search}%`;
    // Prima risolviamo i soggetti corrispondenti (PostgREST non supporta .or() su risorse embedded)
    const { data: soggettiMatch } = await supabase
      .from('anagrafica_soggetti')
      .select('id')
      .ilike('ragione_sociale', searchTerm);
    const soggettiIds = (soggettiMatch || []).map((s: { id: string }) => s.id);
    if (soggettiIds.length > 0) {
      query = query.or(
        `fattura_riferimento.ilike.${searchTerm},descrizione.ilike.${searchTerm},soggetto_id.in.(${soggettiIds.join(',')})`
      );
    } else {
      query = query.or(`fattura_riferimento.ilike.${searchTerm},descrizione.ilike.${searchTerm}`);
    }
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
import { addDays, startOfWeek, endOfWeek, format, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';

export interface CashflowDetailRow {
  id: string;                   // scadenze_pagamento.id per la server action
  ragione_sociale: string;
  fattura_riferimento: string | null;
  data_effettiva: string;       // data usata per il posizionamento
  importo_residuo: number;
  tipo: 'entrata' | 'uscita';
}

export interface CashflowWeek {
  weekLabel: string;            // "Dal 24/02 al 02/03"
  weekStart: string;            // ISO date per sorting
  entrate: number;
  uscite: number;
  saldoPrevisto: number;
  dettagli: CashflowDetailRow[];
}

export interface CashflowProjection {
  saldoAttuale: number;
  weeks: CashflowWeek[];
  daPianificare: CashflowWeek | null;   // bucket separato: non influenza il saldo
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
    .select(`
      id, tipo, importo_totale, importo_pagato, data_scadenza, data_pianificata, stato,
      fattura_riferimento,
      anagrafica_soggetti:soggetto_id (ragione_sociale)
    `)
    .neq('stato', 'pagato')
    .lte('data_scadenza', endDate);

  const safeScadenze = scadenze || [];

  // 3. Aggregazione per Settimana
  type WeekBucket = { entrate: number; uscite: number; dettagli: CashflowDetailRow[]; weekStart: Date };
  const weeksMap = new Map<string, WeekBucket>();
  const today = new Date();

  // Bucket separato per fatture senza data pianificata certa (non influenza il saldo)
  const pastLabel = "Da Pianificare";
  weeksMap.set(pastLabel, { entrate: 0, uscite: 0, dettagli: [], weekStart: new Date(0) });

  // Pre-popoliamo le prossime settimane con label "Dal dd/MM al dd/MM"
  for (let i = 0; i < Math.ceil(days / 7); i++) {
    const ws = startOfWeek(addDays(today, i * 7), { weekStartsOn: 1 });
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const label = `Dal ${format(ws, 'dd/MM')} al ${format(we, 'dd/MM')}`;
    if (!weeksMap.has(label)) {
      weeksMap.set(label, { entrate: 0, uscite: 0, dettagli: [], weekStart: ws });
    }
  }

  // Smistiamo le scadenze
  safeScadenze.forEach(s => {
    const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
    if (residuo <= 0) return;

    const dataPianificata = (s as any).data_pianificata as string | null | undefined;

    // Regola del parcheggio: senza data_pianificata esplicita → "Da Pianificare", sempre
    const detail: CashflowDetailRow = {
      id: (s as any).id,
      ragione_sociale: (s as any).anagrafica_soggetti?.ragione_sociale || 'N/D',
      fattura_riferimento: s.fattura_riferimento ?? null,
      data_effettiva: dataPianificata || s.data_scadenza,
      importo_residuo: residuo,
      tipo: s.tipo as 'entrata' | 'uscita',
    };

    if (!dataPianificata) {
      // Nessuna data pianificata → parcheggio
      const past = weeksMap.get(pastLabel)!;
      if (s.tipo === 'entrata') past.entrate += residuo;
      else past.uscite += residuo;
      past.dettagli.push(detail);
      return;
    }

    const dScadenza = new Date(dataPianificata);

    // data_pianificata nel passato (prima della settimana corrente) → parcheggio
    if (isBefore(dScadenza, startOfWeek(today, { weekStartsOn: 1 }))) {
      const past = weeksMap.get(pastLabel)!;
      if (s.tipo === 'entrata') past.entrate += residuo;
      else past.uscite += residuo;
      past.dettagli.push(detail);
      return;
    }

    // data_pianificata futura → settimana corretta
    const ws = startOfWeek(dScadenza, { weekStartsOn: 1 });
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const label = `Dal ${format(ws, 'dd/MM')} al ${format(we, 'dd/MM')}`;

    if (weeksMap.has(label)) {
      const current = weeksMap.get(label)!;
      if (s.tipo === 'entrata') current.entrate += residuo;
      else current.uscite += residuo;
      current.dettagli.push(detail);
    }
  });

  // 4. Estrai il bucket "Da Pianificare" PRIMA del calcolo del saldo (non deve influenzare la linea blu)
  const daPianificareData = weeksMap.get(pastLabel);
  weeksMap.delete(pastLabel);

  const daPianificare: CashflowWeek | null =
    daPianificareData && (daPianificareData.entrate > 0 || daPianificareData.uscite > 0)
      ? {
          weekLabel: 'Da Pianificare',
          weekStart: new Date(0).toISOString(),
          entrate: daPianificareData.entrate,
          uscite: daPianificareData.uscite,
          saldoPrevisto: 0,   // non significativo: è fuori dal flusso
          dettagli: daPianificareData.dettagli.sort((a, b) => a.data_effettiva.localeCompare(b.data_effettiva)),
        }
      : null;

  // 5. Calcolo Saldo Progressivo (solo settimane future)
  let runningBalance = saldoAttuale;
  let hasNegativeWeeks = false;
  const weeks: CashflowWeek[] = [];

  Array.from(weeksMap.entries()).forEach(([weekLabel, vals]) => {
    runningBalance += vals.entrate;
    runningBalance -= vals.uscite;
    if (runningBalance < 0) hasNegativeWeeks = true;

    weeks.push({
      weekLabel,
      weekStart: vals.weekStart.toISOString(),
      entrate: vals.entrate,
      uscite: vals.uscite,
      saldoPrevisto: runningBalance,
      dettagli: vals.dettagli.sort((a, b) => a.data_effettiva.localeCompare(b.data_effettiva)),
    });
  });

  return { saldoAttuale, weeks, daPianificare, hasNegativeWeeks };
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

// ---------------------------------------------------------------------------
// Helper: arricchisce un array di movimenti con i dati del conto bancario.
// movimenti_banca è una tabella partizionata → PostgREST non riesce a risolvere
// FK-hint ambigui (conto_banca_id + conto_destinazione_id entrambi → conti_banca).
// Si usa quindi un secondo round-trip separato su conti_banca.
// ---------------------------------------------------------------------------
async function enrichWithContiBanca<T extends { conto_banca_id?: string | null }>(movimenti: T[]): Promise<(T & { conti_banca: { nome_banca: string | null; nome_conto: string | null } | null })[]> {
  if (!movimenti.length) return movimenti.map(m => ({ ...m, conti_banca: null }));
  const supabase = getSupabaseAdmin();
  const ids = [...new Set(movimenti.map(m => m.conto_banca_id).filter(Boolean))] as string[];
  const { data: conti } = await supabase
    .from('conti_banca')
    .select('id, nome_banca, nome_conto')
    .in('id', ids);
  const contiMap = new Map((conti || []).map(c => [c.id, c]));
  return movimenti.map(m => ({
    ...m,
    conti_banca: m.conto_banca_id ? (contiMap.get(m.conto_banca_id) ?? null) : null,
  }));
}

export async function getStoricoGiroconti() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('*')
    .eq('categoria_dedotta', 'giroconto')
    .eq('stato_riconciliazione', 'riconciliato')
    .order('data_operazione', { ascending: false });
  if (error) {
    console.error("❌ Errore recupero storico giroconti:", error);
    return [];
  }
  return enrichWithContiBanca(data || []);
}

export async function getStoricoF24() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('*')
    .eq('categoria_dedotta', 'f24')
    .eq('stato_riconciliazione', 'riconciliato')
    .order('data_operazione', { ascending: false });
  if (error) {
    console.error("❌ Errore storico F24:", error);
    return [];
  }
  return enrichWithContiBanca(data || []);
}

export async function getStoricoFinanziamentiSocio() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('*')
    .eq('categoria_dedotta', 'finanziamento_socio')
    .eq('stato_riconciliazione', 'riconciliato')
    .order('data_operazione', { ascending: false });
  if (error) {
    console.error("❌ Errore storico finanziamenti socio:", error);
    return [];
  }
  return enrichWithContiBanca(data || []);
}

export async function getScadenzeSoggetto(soggettoId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('id, tipo, importo_totale, importo_pagato, data_scadenza, data_pianificata, stato, fattura_riferimento, descrizione, file_url, categoria')
    .eq('soggetto_id', soggettoId)
    .order('data_pianificata', { ascending: true }); // Ordina per la data operativa che abbiamo creato

  if (error) {
    console.error("❌ Errore fetch scadenze soggetto:", error);
    return [];
  }
  return data || [];
}

// ==========================================
// BLOCCO D: COMMISSIONI BANCARIE (SPESE)
// ==========================================

export interface SpesaMensile {
  mese: string;
  totale: number;
  conteggio: number;
  movimenti: Array<{
    id: string;
    data_operazione: string;
    descrizione: string;
    importo: number;
    note_riconciliazione: string | null;
  }>;
}

export async function getSpeseBancarieConto(conto_banca_id: string, anno?: number): Promise<SpesaMensile[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('movimenti_banca')
    .select('id, importo, data_operazione, categoria_dedotta, descrizione, note_riconciliazione')
    .eq('conto_banca_id', conto_banca_id)
    .eq('categoria_dedotta', 'commissione');

  if (anno) {
    query = query
      .gte('data_operazione', `${anno}-01-01`)
      .lte('data_operazione', `${anno}-12-31T23:59:59`);
  }

  query = (query as any).order('data_operazione', { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  const grouped = data.reduce((acc: Record<string, SpesaMensile>, curr: any) => {
    const mese = curr.data_operazione.substring(0, 7);
    if (!acc[mese]) acc[mese] = { mese, totale: 0, conteggio: 0, movimenti: [] };
    acc[mese].totale += Math.abs(curr.importo || 0);
    acc[mese].conteggio += 1;
    acc[mese].movimenti.push({
      id: curr.id,
      data_operazione: curr.data_operazione,
      descrizione: curr.descrizione,
      importo: curr.importo,
      note_riconciliazione: curr.note_riconciliazione ?? null,
    });
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => b.mese.localeCompare(a.mese));
}

export async function getDettaglioSpeseBancarie(
  conto_banca_id: string,
  pagination: PaginationParams,
  anno?: number
): Promise<PaginatedResult<any>> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('movimenti_banca')
    .select('id, data_operazione, descrizione, importo', { count: 'exact' })
    .eq('conto_banca_id', conto_banca_id)
    .eq('categoria_dedotta', 'commissione');

  if (anno) {
    query = query
      .gte('data_operazione', `${anno}-01-01`)
      .lte('data_operazione', `${anno}-12-31T23:59:59`);
  }

  query = query.order('data_operazione', { ascending: false });

  return await executePaginatedQuery(query, pagination);
}

export async function getTotaleSpeseBancarieGlobale(anno: number): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('importo')
    .eq('categoria_dedotta', 'commissione')
    .gte('data_operazione', `${anno}-01-01`)
    .lte('data_operazione', `${anno}-12-31T23:59:59`);

  if (error || !data) return 0;

  return data.reduce((acc: number, curr: any) => acc + Math.abs(curr.importo || 0), 0);
}

// ==========================================
// COSTI RICORRENTI (leasing, assicurazione, mutuo, interessi_bancari)
// ==========================================

export interface CostoRicorrenteMensile {
  mese: string;
  totale_leasing: number;
  totale_assicurazione: number;
  totale_mutuo: number;
  totale_interessi: number;
  dettagli: Array<{ id: string; data_operazione: string; descrizione: string; importo: number; categoria_dedotta: string; ragione_sociale?: string; note_riconciliazione?: string }>;
}

const CATEGORIE_RICORRENTI = ['leasing', 'assicurazione', 'mutuo', 'interessi_bancari'] as const;

export async function getCostiRicorrentiConto(contoId: string, anno: number): Promise<CostoRicorrenteMensile[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('movimenti_banca')
    .select('id, data_operazione, descrizione, importo, categoria_dedotta, soggetto_id, note_riconciliazione')
    .eq('conto_banca_id', contoId)
    .eq('stato_riconciliazione', 'riconciliato')
    .in('categoria_dedotta', CATEGORIE_RICORRENTI as unknown as string[])
    .gte('data_operazione', `${anno}-01-01`)
    .lte('data_operazione', `${anno}-12-31T23:59:59`)
    .order('data_operazione', { ascending: true });

  if (error || !data) return [];

  // Recupera ragione_sociale per i soggetti linkati
  const soggettiIds = [...new Set(data.filter(d => d.soggetto_id).map(d => d.soggetto_id))];
  let soggettiMap: Record<string, string> = {};
  if (soggettiIds.length > 0) {
    const { data: soggetti } = await supabase
      .from('anagrafica_soggetti')
      .select('id, ragione_sociale')
      .in('id', soggettiIds);
    if (soggetti) {
      soggettiMap = Object.fromEntries(soggetti.map(s => [s.id, s.ragione_sociale]));
    }
  }

  const grouped = data.reduce((acc: Record<string, CostoRicorrenteMensile>, curr: any) => {
    const mese = curr.data_operazione.substring(0, 7); // "2026-01"
    if (!acc[mese]) {
      acc[mese] = { mese, totale_leasing: 0, totale_assicurazione: 0, totale_mutuo: 0, totale_interessi: 0, dettagli: [] };
    }
    const importoAbs = Math.abs(curr.importo || 0);
    switch (curr.categoria_dedotta) {
      case 'leasing': acc[mese].totale_leasing += importoAbs; break;
      case 'assicurazione': acc[mese].totale_assicurazione += importoAbs; break;
      case 'mutuo': acc[mese].totale_mutuo += importoAbs; break;
      case 'interessi_bancari': acc[mese].totale_interessi += importoAbs; break;
    }
    acc[mese].dettagli.push({
      id: curr.id,
      data_operazione: curr.data_operazione,
      descrizione: curr.descrizione,
      importo: curr.importo,
      categoria_dedotta: curr.categoria_dedotta,
      ragione_sociale: curr.soggetto_id ? soggettiMap[curr.soggetto_id] : undefined,
      note_riconciliazione: curr.note_riconciliazione || undefined,
    });
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => a.mese.localeCompare(b.mese));
}

// ==========================================
// GIROCONTI VERSO CARTA / CONTO PREPAGATO
// ==========================================
export async function getGirocontiVersoCartaConto(contoDestinazioneId: string) {
  const supabase = getSupabaseAdmin();

  // Recupera info del conto destinazione per trovare le ultime cifre della carta
  const { data: contoDest } = await supabase
    .from('conti_banca')
    .select('nome_conto, iban, nome_banca')
    .eq('id', contoDestinazioneId)
    .single();

  if (!contoDest) return [];

  const lastDigits = contoDest.nome_conto?.match(/\*?(\d{3,4})/)?.[1];
  const ibanSuffix = contoDest.iban?.slice(-4);
  const nomeConto = (contoDest.nome_conto || '').toLowerCase();

  const MOV_SELECT = 'id, data_operazione, descrizione, importo, ai_motivo, note_riconciliazione, conto_banca_id';

  // Prima strada: join esplicita tramite conto_destinazione_id (metodo diretto)
  const { data: viaId } = await supabase
    .from('movimenti_banca')
    .select(MOV_SELECT)
    .neq('conto_banca_id', contoDestinazioneId)
    .in('categoria_dedotta', ['giroconto', 'carta_credito'])
    .eq('stato_riconciliazione', 'riconciliato')
    .eq('conto_destinazione_id', contoDestinazioneId)
    .order('data_operazione', { ascending: false });

  if (viaId && viaId.length > 0) return enrichWithContiBanca(viaId);

  // Seconda strada: fallback testuale
  if (!lastDigits && !nomeConto) return [];

  const orFilters: string[] = [];
  if (lastDigits) orFilters.push(
    `descrizione.ilike.%${lastDigits}%`,
    `ai_motivo.ilike.%${lastDigits}%`,
    `note_riconciliazione.ilike.%${lastDigits}%`
  );
  if (ibanSuffix && ibanSuffix !== lastDigits) orFilters.push(
    `descrizione.ilike.%${ibanSuffix}%`,
    `note_riconciliazione.ilike.%${ibanSuffix}%`
  );
  if (nomeConto.length > 3) orFilters.push(
    `ai_motivo.ilike.%${nomeConto}%`,
    `note_riconciliazione.ilike.%${nomeConto}%`
  );

  if (orFilters.length === 0) return [];

  const { data: viaText } = await supabase
    .from('movimenti_banca')
    .select(MOV_SELECT)
    .neq('conto_banca_id', contoDestinazioneId)
    .in('categoria_dedotta', ['giroconto', 'carta_credito'])
    .eq('stato_riconciliazione', 'riconciliato')
    .or(orFilters.join(','))
    .order('data_operazione', { ascending: false });

  return enrichWithContiBanca(viaText || []);
}
// ============================================================
// GESTIONE MUTUI
// ============================================================

import { Mutuo, MutuoConRate, RataMutuo, Titolo } from '@/types/finanza';

/**
 * Recupera tutti i mutui con il conteggio delle rate pagate/rimanenti
 * e la prossima scadenza. Incluso il nome del conto bancario associato.
 */
export async function getMutuiConRate(): Promise<MutuoConRate[]> {
  const supabase = getSupabaseAdmin();

  const { data: mutui, error } = await supabase
    .from('mutui')
    .select('*, conti_banca!inner(nome_banca, nome_conto)')
    .order('stato', { ascending: true })
    .order('created_at', { ascending: false });

  if (error || !mutui) {
    console.error("❌ Errore getMutuiConRate:", error);
    return [];
  }

  const result: MutuoConRate[] = [];
  for (const m of mutui) {
    // conteggio rate pagate
    const { count: pagate } = await supabase
      .from('rate_mutuo')
      .select('*', { count: 'exact', head: true })
      .eq('mutuo_id', m.id)
      .eq('stato', 'pagato');

    // prossima rata da pagare
    const { data: prossima } = await supabase
      .from('rate_mutuo')
      .select('data_scadenza, importo_rata')
      .eq('mutuo_id', m.id)
      .eq('stato', 'da_pagare')
      .order('data_scadenza', { ascending: true })
      .limit(1)
      .single();

    result.push({
      ...m,
      conti_banca: m.conti_banca || null,
      rate_pagate: pagate || 0,
      rate_rimanenti: m.numero_rate - (pagate || 0),
      prossima_scadenza: prossima?.data_scadenza || null,
      importo_rata: prossima?.importo_rata || undefined,
    });
  }

  return result;
}

/**
 * Recupera le rate di un singolo mutuo, ordinate per numero rata.
 */
export async function getRateMutuo(mutuoId: string): Promise<RataMutuo[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('rate_mutuo')
    .select('*')
    .eq('mutuo_id', mutuoId)
    .order('numero_rata', { ascending: true });

  if (error) console.error("❌ Errore getRateMutuo:", error);
  return (data as RataMutuo[]) || [];
}

/**
 * Crea un mutuo e genera automaticamente tutte le rate + scadenze corrispondenti.
 */
export async function inserisciMutuoConRate(input: {
  conto_banca_id: string;
  numero_pratica?: string;
  banca_erogante: string;
  soggetto_id?: string;
  numero_rate: number;
  scopo?: string;
  capitale_erogato: number;
  tipo_tasso: 'fisso' | 'variabile' | 'misto';
  taeg_isc?: number;
  spese_istruttoria?: number;
  spese_perizia?: number;
  spese_incasso_rata?: number;
  spese_gestione_pratica?: number;
  periodicita: 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';
  data_prima_rata: string;
  data_stipula?: string;
  importo_rata: number;
  note?: string;
}) {
  const supabase = getSupabaseAdmin();

  // 1. Inserisci il mutuo
  const { data: mutuo, error: errMutuo } = await supabase
    .from('mutui')
    .insert({
      conto_banca_id: input.conto_banca_id,
      numero_pratica: input.numero_pratica || null,
      banca_erogante: input.banca_erogante,
      soggetto_id: input.soggetto_id || null,
      numero_rate: input.numero_rate,
      scopo: input.scopo || null,
      capitale_erogato: input.capitale_erogato,
      tipo_tasso: input.tipo_tasso,
      taeg_isc: input.taeg_isc || null,
      spese_istruttoria: input.spese_istruttoria || 0,
      spese_perizia: input.spese_perizia || 0,
      spese_incasso_rata: input.spese_incasso_rata || 0,
      spese_gestione_pratica: input.spese_gestione_pratica || 0,
      periodicita: input.periodicita,
      data_prima_rata: input.data_prima_rata,
      data_stipula: input.data_stipula || null,
      stato: 'attivo',
      note: input.note || null,
    })
    .select('id')
    .single();

  if (errMutuo || !mutuo) {
    console.error("❌ Errore creazione mutuo:", errMutuo);
    throw new Error("Impossibile creare il mutuo");
  }

  // 2. Genera le rate
  const mesiIncremento: Record<string, number> = {
    mensile: 1,
    trimestrale: 3,
    semestrale: 6,
    annuale: 12,
  };
  const incremento = mesiIncremento[input.periodicita];
  const oggi = new Date().toISOString().slice(0, 10);

  const rateBatch: any[] = [];
  const scadenzeBatch: any[] = [];

  for (let i = 0; i < input.numero_rate; i++) {
    const dataScadenza = new Date(input.data_prima_rata);
    dataScadenza.setMonth(dataScadenza.getMonth() + i * incremento);
    const dataStr = dataScadenza.toISOString().slice(0, 10);
    const stato = dataStr < oggi ? 'pagato' : 'da_pagare';

    rateBatch.push({
      mutuo_id: mutuo.id,
      numero_rata: i + 1,
      importo_rata: input.importo_rata,
      data_scadenza: dataStr,
      stato,
    });

    // Crea scadenza corrispondente solo per rate future
    if (stato === 'da_pagare') {
      scadenzeBatch.push({
        descrizione: `Rata ${i + 1}/${input.numero_rate} mutuo ${input.banca_erogante}${input.scopo ? ' - ' + input.scopo : ''}`,
        importo: input.importo_rata,
        data_scadenza: dataStr,
        tipo: 'uscita',
        stato: 'da_pagare',
        categoria: 'rata_mutuo',
        soggetto_id: input.soggetto_id || null,
        fonte: 'mutuo',
        auto_domiciliazione: true,
      });
    }
  }

  // 3. Inserisci tutte le rate
  const { error: errRate } = await supabase.from('rate_mutuo').insert(rateBatch);
  if (errRate) {
    console.error("❌ Errore inserimento rate:", errRate);
    throw new Error("Mutuo creato ma errore nelle rate");
  }

  // 4. Inserisci le scadenze per le rate future
  if (scadenzeBatch.length > 0) {
    const { data: scadenzeInserite, error: errSc } = await supabase
      .from('scadenze_pagamento')
      .insert(scadenzeBatch)
      .select('id');

    if (errSc) {
      console.error("❌ Errore inserimento scadenze mutuo:", errSc);
    } else if (scadenzeInserite) {
      // Associa le scadenze alle rate (solo rate future, in ordine)
      const rateFuture = rateBatch.filter(r => r.stato === 'da_pagare');
      for (let i = 0; i < scadenzeInserite.length; i++) {
        const rataCorrispondente = rateFuture[i];
        if (rataCorrispondente) {
          await supabase
            .from('rate_mutuo')
            .update({ scadenza_id: scadenzeInserite[i].id })
            .eq('mutuo_id', mutuo.id)
            .eq('numero_rata', rataCorrispondente.numero_rata);
        }
      }
    }
  }

  return mutuo.id;
}

// ============================================================
// GESTIONE TITOLI (Assegni, Cambiali)
// ============================================================

/**
 * Recupera tutti i titoli con join opzionale ai soggetti.
 */
export async function getTitoli(filtroStato?: string): Promise<Titolo[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('titoli')
    .select('*, anagrafica_soggetti(ragione_sociale)')
    .order('data_scadenza', { ascending: true });

  if (filtroStato) {
    query = query.eq('stato', filtroStato);
  }

  const { data, error } = await query;
  if (error) console.error("❌ Errore getTitoli:", error);
  return (data as Titolo[]) || [];
}

/**
 * Inserisce un nuovo titolo (assegno o cambiale) e crea la scadenza associata.
 */
export async function inserisciTitolo(input: {
  tipo: 'assegno' | 'cambiale';
  soggetto_id?: string;
  importo: number;
  data_scadenza: string;
  data_emissione?: string;
  banca_incasso?: string;
  numero_titolo?: string;
  note?: string;
  file_url?: string;
  ocr_data?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();

  // 1. Crea la scadenza associata
  const tipoLabel = input.tipo === 'assegno' ? 'Assegno' : 'Cambiale';
  const { data: scadenza, error: errSc } = await supabase
    .from('scadenze_pagamento')
    .insert({
      descrizione: `${tipoLabel} ${input.numero_titolo ? '#' + input.numero_titolo : ''} - ${input.banca_incasso || 'Da pagare'}`.trim(),
      importo_totale: input.importo,
      importo_pagato: 0,
      data_scadenza: input.data_scadenza,
      data_pianificata: input.data_scadenza,
      tipo: 'uscita',
      stato: 'da_pagare',
      categoria: 'titolo',
      fonte: 'titolo',
      soggetto_id: input.soggetto_id || null,
    })
    .select('id')
    .single();

  if (errSc) {
    console.error("❌ Errore creazione scadenza titolo:", errSc);
    throw new Error("Impossibile creare la scadenza per il titolo");
  }

  // 2. Inserisci il titolo
  const { data: titolo, error: errTitolo } = await supabase
    .from('titoli')
    .insert({
      tipo: input.tipo,
      soggetto_id: input.soggetto_id || null,
      importo: input.importo,
      data_scadenza: input.data_scadenza,
      data_emissione: input.data_emissione || null,
      banca_incasso: input.banca_incasso || null,
      numero_titolo: input.numero_titolo || null,
      stato: 'in_essere',
      scadenza_id: scadenza?.id || null,
      file_url: input.file_url || null,
      note: input.note || null,
      ocr_data: input.ocr_data || null,
    })
    .select('id')
    .single();

  if (errTitolo) {
    console.error("❌ Errore inserimento titolo:", errTitolo);
    throw new Error("Impossibile inserire il titolo");
  }

  return titolo?.id;
}