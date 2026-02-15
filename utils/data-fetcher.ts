// ============================================================
// DATA FETCHER - Query Supabase per dati reali cantieri
// Usato dal webhook per fornire contesto reale a Gemini (RAG)
//
// Legge da: vista_cantieri_budget (VIEW SQL)
// La vista fa automaticamente JOIN cantieri + SUM(movimenti)
// Colonne: id, nome, budget_totale, stato, speso, rimanente
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
  nome: string;
  budget_totale: number;
  speso: number;
  rimanente: number;
  percentuale: number;
  stato: string;
}

// ============================================================
// RICERCA CANTIERE PER NOME (match parziale con ILIKE)
// Es. "Boldone" → trova "Torre Boldone - Ristrutturazione Villa"
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

    // I dati arrivano già calcolati dalla vista SQL!
    const percentuale =
      data.budget_totale > 0
        ? Math.round((data.speso / data.budget_totale) * 100)
        : 0;

    console.log(
      `📊 Cantiere trovato: ${data.nome} | €${data.speso}/${data.budget_totale} (${percentuale}%)`
    );

    return {
      nome: data.nome,
      budget_totale: data.budget_totale,
      speso: data.speso,
      rimanente: data.rimanente,
      percentuale,
      stato: data.stato,
    };
  } catch (error) {
    console.error("🔥 Errore query cantiere:", error);
    return null;
  }
}

// ============================================================
// LISTA TUTTI I CANTIERI APERTI (per domande generiche)
// Es. "Quali cantieri abbiamo?" o "Come siamo messi?"
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
      nome: c.nome,
      budget_totale: c.budget_totale,
      speso: c.speso,
      rimanente: c.rimanente,
      percentuale:
        c.budget_totale > 0
          ? Math.round((c.speso / c.budget_totale) * 100)
          : 0,
      stato: c.stato,
    }));
  } catch (error) {
    console.error("🔥 Errore query cantieri aperti:", error);
    return [];
  }
}

// ============================================================
// HELPER: Formatta i dati cantiere in testo leggibile per Gemini
// ============================================================

export function formatCantiereForAI(cantiere: CantiereData): string {
  return `DATI REALI DAL DATABASE:
- Cantiere: ${cantiere.nome}
- Budget Totale: €${cantiere.budget_totale.toLocaleString("it-IT")}
- Speso finora: €${cantiere.speso.toLocaleString("it-IT")} (somma movimenti registrati)
- Rimanente: €${cantiere.rimanente.toLocaleString("it-IT")}
- Avanzamento spesa: ${cantiere.percentuale}%
- Stato cantiere: ${cantiere.stato}`;
}

export function formatCantieriListForAI(cantieri: CantiereData[]): string {
  if (cantieri.length === 0) return "Nessun cantiere aperto trovato nel database.";

  const header = `DATI REALI DAL DATABASE (${cantieri.length} cantieri aperti):`;
  const rows = cantieri
    .map(
      (c) =>
        `- ${c.nome}: €${c.speso.toLocaleString("it-IT")} spesi su €${c.budget_totale.toLocaleString("it-IT")} di budget (${c.percentuale}%, rimangono €${c.rimanente.toLocaleString("it-IT")})`
    )
    .join("\n");

  return `${header}\n${rows}`;
}
