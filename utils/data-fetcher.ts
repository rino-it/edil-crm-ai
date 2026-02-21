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

// ============================================================
// ARCHIVIO CANTIERE: Gestione Documentale e CRUD
// Lettura/Scrittura della vista e tabella cantiere_documenti
// ============================================================

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
  // Join fittizio se vogliamo il nome del cantiere in alcune viste
  cantieri?: { nome: string };
}

// 1. Lettura Documenti (Usa la vista per avere lo stato aggiornato)
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

// 2. Inserimento Nuovo Documento
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

// 3. Eliminazione Documento (Gestirà anche la cancellazione dal Bucket nel Frontend/Actions)
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

// 4. Per il Cron Job: Trova i documenti in scadenza di tutti i cantieri
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

// ============================================================
// ANAGRAFICHE: Soggetti (Fornitori e Clienti)
// ============================================================

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
}

// 1. Lista soggetti con filtro opzionale per tipo
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

// 2. Dettaglio singolo soggetto
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

// 3. Upsert per import automatico (usato da riconciliazione XML)
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

// 4. KPI Anagrafiche (Totale Fornitori, Totale Clienti)
export async function getKPIAnagrafiche(): Promise<{ fornitori: number; clienti: number }> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from("anagrafica_soggetti")
    .select("tipo");

  if (error || !data) return { fornitori: 0, clienti: 0 };

  const fornitori = data.filter(s => s.tipo === 'fornitore').length;
  const clienti = data.filter(s => s.tipo === 'cliente').length;

  return { fornitori, clienti };
}

// ============================================================
// SCADENZIARIO E FINANZA: Interfacce
// ============================================================

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

// ============================================================
// SCADENZIARIO E FINANZA: Query
// ============================================================

// 1. Lista scadenze con filtri e join
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

  // Default: prima le scadute, poi per data scadenza
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

// 2. Calcolo KPI Finanziari (Priorità Crediti)
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

// 3. Formula DSO: Media giorni incasso ultimi 90gg
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

// 4. Aging Analysis Crediti
export async function getAgingAnalysis() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato, data_scadenza')
    .eq('tipo', 'entrata')
    .neq('stato', 'pagato');

  if (error || !data) return { f1: 0, f2: 0, f3: 0, f4: 0 };

  const oggi = new Date();
  const fasce = { f1: 0, f2: 0, f3: 0, f4: 0 }; // 0-30, 31-60, 61-90, >90

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

// ============================================================
// STEP 4: DASHBOARD FINANZIARIA (MOTORE EVOLUTO)
// ============================================================

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
  const dso = 30; // Placeholder per DSO (implementeremo formula complessa in seguito)

  return { cassa_attuale, fatturato, costi, margine, dso, soglia_alert };
}

// Modificata: accetta il tipo (entrata o uscita) per analizzare sia crediti che debiti
export async function getAgingAnalysisData(tipo: 'entrata' | 'uscita' = 'entrata') {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
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

// Modificata: Il Cashflow ora considera il "peso" immediato di tutte le fatture già scadute
export async function getCashflowPrevisionale(giorni: number = 90) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const kpis = await getKPIFinanziariGlob();
  let cassaProgressiva = kpis.cassa_attuale;

  const oggi = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + giorni);

  // Scarica TUTTO lo scaduto e il futuro non pagato
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

      // Se è nel passato, lo accumuliamo nel "Giorno 0" (impatto immediato)
      if (dataScad < oggi) {
        if (s.tipo === 'entrata') creditiScaduti += residuo;
        if (s.tipo === 'uscita') debitiScaduti += residuo;
      } else {
        // Altrimenti lo mettiamo nella timeline futura
        const dataStr = s.data_scadenza;
        if (!timeline[dataStr]) timeline[dataStr] = { entrate: 0, uscite: 0 };
        if (s.tipo === 'entrata') timeline[dataStr].entrate += residuo;
        if (s.tipo === 'uscita') timeline[dataStr].uscite += residuo;
      }
    });
  }

  // Applichiamo l'urto dello scaduto sulla cassa di partenza
  cassaProgressiva = cassaProgressiva + creditiScaduti - debitiScaduti;

  const proiezioni: Array<{ data: string, saldo: number, entrate_giorno: number, uscite_giorno: number }> = [];
  
  proiezioni.push({
    data: oggi.toISOString().split('T')[0],
    saldo: cassaProgressiva,
    entrate_giorno: creditiScaduti, // Mostriamo sul grafico quanto scaduto c'è da sistemare subito
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
// STEP 5: RICONCILIAZIONE BANCARIA (PARSER E DB)
// ============================================================

export function parseCSVBanca(csvText: string) {
  // Pulizia iniziale: rimuoviamo spazi bianchi eccessivi
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l !== '');
  const movimenti = [];

  console.log("📊 DEBUG CSV: Prime 3 righe rilevate:", lines.slice(0, 3));

  for (let i = 1; i < lines.length; i++) {
    // Prova prima col punto e virgola, se fallisce prova con la virgola
    let cols = lines[i].split(';');
    if (cols.length < 5) cols = lines[i].split(','); 

    if (cols.length < 5) {
      console.warn(`⚠️ Riga ${i} scartata: troppe poche colonne (${cols.length})`);
      continue;
    }

    const dataOpRaw = cols[0].trim();
    let data_operazione = dataOpRaw;
    
    // Supporto per vari formati data (DD/MM/YYYY o DD-MM-YYYY)
    const separator = dataOpRaw.includes('/') ? '/' : '-';
    const parts = dataOpRaw.split(separator);
    if (parts.length === 3) {
      // Se l'anno è il primo elemento (YYYY-MM-DD), lo teniamo così, altrimenti invertiamo
      data_operazione = parts[2].length === 4 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dataOpRaw;
    }

    const descrizione = cols[2]?.trim() || "Senza descrizione";
    
    const parseImporto = (val: string) => {
      if (!val) return 0;
      // Toglie valuta, spazi, e converte formato europeo (1.200,00) in standard (1200.00)
      const pulito = val.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
      return parseFloat(pulito) || 0;
    };

    const dare = parseImporto(cols[3]); 
    const avere = parseImporto(cols[4]); 
    const importo = avere !== 0 ? avere : -dare;

    if (importo !== 0) {
      movimenti.push({
        data_operazione,
        descrizione,
        importo,
        stato: 'non_riconciliato'
      });
    }
  }
  
  console.log(`✅ Analisi completata: ${movimenti.length} movimenti validi trovati.`);
  return movimenti;
}

export async function importMovimentiBanca(movimenti: any[]) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Inseriamo i movimenti (Supabase ignorerà i duplicati se imposteremo un vincolo in futuro)
  const { data, error } = await supabase
    .from('movimenti_banca')
    .insert(movimenti)
    .select();
    
  if (error) throw new Error(error.message);
  return data;
}

export async function getMovimentiNonRiconciliati() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data } = await supabase
    .from('movimenti_banca')
    .select('*')
    .eq('stato', 'non_riconciliato')
    .order('data_operazione', { ascending: false });
    
  return data || [];
}

export async function getScadenzeApertePerMatch(tipo: 'entrata' | 'uscita') {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data } = await supabase
    .from('scadenze_pagamento')
    .select(`id, fattura_riferimento, importo_totale, importo_pagato, data_scadenza, tipo, anagrafica_soggetti(ragione_sociale)`)
    .eq('tipo', tipo)
    .neq('stato', 'pagato');
    
  return data || [];
}

export async function confermaRiconciliazione(movimento_id: string, scadenza_id: string, importo_movimento: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // 1. Segna il movimento come riconciliato
  await supabase
    .from('movimenti_banca')
    .update({ 
      stato: 'riconciliato', 
      scadenza_id: scadenza_id 
    })
    .eq('id', movimento_id);

  // 2. Recupera la scadenza attuale per sommare il pagato
  const { data: scadenza } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, importo_pagato')
    .eq('id', scadenza_id)
    .single();

  if (scadenza) {
    const nuovoPagato = (Number(scadenza.importo_pagato) || 0) + Math.abs(importo_movimento);
    const nuovoStato = nuovoPagato >= Number(scadenza.importo_totale) ? 'pagato' : 'parziale';
    
    // 3. Aggiorna la scadenza
    await supabase
      .from('scadenze_pagamento')
      .update({
        importo_pagato: nuovoPagato,
        stato: nuovoStato,
        data_pagamento: new Date().toISOString().split('T')[0]
      })
      .eq('id', scadenza_id);
  }
}