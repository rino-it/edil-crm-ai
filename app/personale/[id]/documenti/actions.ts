"use server";

// ============================================================
// SERVER ACTIONS: Gestione documenti personale
// Usate dal DocumentiClient per confermare/rifiutare documenti
// con supervisione umana obbligatoria.
// ============================================================

import { revalidatePath } from "next/cache";
import {
  salvaDocumentoBozza,
  validaEConfermaDocumento,
} from "@/utils/data-fetcher";
import { createClient } from "@/utils/supabase/server";

// ============================================================
// ACTION: Salva bozza documento dopo analisi AI
// Chiamata subito dopo che l'API ha restituito i dati estratti
// ============================================================

export async function salvaBozzaAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato");

  const personale_id = formData.get("personale_id") as string;
  const nome_file = formData.get("nome_file") as string;
  const url_file = formData.get("url_file") as string;
  const categoria = formData.get("categoria") as string;
  const dati_estratti_raw = formData.get("dati_estratti") as string;
  const data_scadenza = formData.get("data_scadenza") as string | null;

  if (!personale_id || !nome_file || !url_file || !categoria || !dati_estratti_raw) {
    throw new Error("Parametri mancanti per il salvataggio bozza");
  }

  const dati_estratti = JSON.parse(dati_estratti_raw);

  const result = await salvaDocumentoBozza({
    personale_id,
    nome_file,
    url_file,
    categoria,
    dati_estratti,
    data_scadenza: data_scadenza || null,
  });

  if (!result.success) {
    throw new Error(result.error || "Errore salvataggio bozza");
  }

  revalidatePath(`/personale/${personale_id}/documenti`);
  return { success: true, id: result.id };
}

// ============================================================
// ACTION: Conferma documento (supervisione umana → validato)
// Aggiorna dati_validati, stato="validato", e costo_config
// ============================================================

export async function confermaDocumentoAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato");

  const documento_id = formData.get("documento_id") as string;
  const personale_id = formData.get("personale_id") as string;
  const dati_validati_raw = formData.get("dati_validati") as string;
  const data_scadenza = formData.get("data_scadenza") as string | null;
  const costo_orario_reale_raw = formData.get("costo_orario_reale") as string | null;

  if (!documento_id || !personale_id || !dati_validati_raw) {
    throw new Error("Parametri mancanti per la conferma");
  }

  const dati_validati = JSON.parse(dati_validati_raw);
  const costo_orario_reale = costo_orario_reale_raw
    ? parseFloat(costo_orario_reale_raw)
    : null;

  const result = await validaEConfermaDocumento({
    documento_id,
    personale_id,
    dati_validati,
    data_scadenza: data_scadenza || null,
    costo_orario_reale,
  });

  if (!result.success) {
    throw new Error(result.error || "Errore conferma documento");
  }

  revalidatePath(`/personale/${personale_id}/documenti`);
  revalidatePath(`/personale`);
  return { success: true };
}

// ============================================================
// ACTION: Rifiuta documento (stato="rifiutato")
// ============================================================

export async function rifiutaDocumentoAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autorizzato");

  const documento_id = formData.get("documento_id") as string;
  const personale_id = formData.get("personale_id") as string;

  if (!documento_id || !personale_id) {
    throw new Error("Parametri mancanti per il rifiuto");
  }

  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const adminClient = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await adminClient
    .from("personale_documenti")
    .update({ stato: "rifiutato" })
    .eq("id", documento_id);

  if (error) throw new Error(error.message);

  revalidatePath(`/personale/${personale_id}/documenti`);
  return { success: true };
}
