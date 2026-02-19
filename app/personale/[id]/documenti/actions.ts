"use server";

import { revalidatePath } from "next/cache";
import { validaEConfermaDocumento } from "@/utils/data-fetcher";

// ============================================================
// SERVER ACTION: Conferma e salva documento validato dall'utente
// Aggiorna stato bozza → validato e opzionalmente costo_config
// ============================================================
export async function confermaDocumento(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  const documentoId = formData.get("documento_id") as string;
  const personaleId = formData.get("personale_id") as string;
  const categoria = formData.get("categoria") as string;
  const dataScadenza = (formData.get("data_scadenza") as string) || null;
  const aggiornaCostoConfig = formData.get("aggiorna_costo_config") === "true";

  // Costruisci dati_validati dal form
  const datiValidati: Record<string, unknown> = {};

  // Campi comuni
  formData.forEach((value, key) => {
    if (
      key !== "documento_id" &&
      key !== "personale_id" &&
      key !== "categoria" &&
      key !== "aggiorna_costo_config"
    ) {
      datiValidati[key] = value;
    }
  });

  // Per contratti: costruisci anche costo_config strutturato
  let costoConfig: Record<string, unknown> | undefined;
  if (categoria === "contratto" && aggiornaCostoConfig) {
    costoConfig = {
      paga_base: parseFloat((datiValidati.paga_base_lorda as string) || "0"),
      paga_base_tipo: (datiValidati.paga_base_tipo as string) || "oraria",
      livello_inquadramento: datiValidati.livello_inquadramento || "",
      aliquota_inps: parseFloat((datiValidati.aliquota_inps as string) || "0.2315"),
      aliquota_inail: parseFloat((datiValidati.aliquota_inail as string) || "0.030"),
      aliquota_edilcassa: parseFloat((datiValidati.aliquota_edilcassa as string) || "0.020"),
      tfr: 0.0741,
      incidenza_ferie: parseFloat((datiValidati.incidenza_ferie as string) || "0.1082"),
      maggiorazione_straordinari: parseFloat(
        (datiValidati.coefficiente_straordinari as string) || "1.25"
      ),
      trasferta_giornaliera: 50,
      aggiornato_il: new Date().toISOString(),
    };
  }

  const result = await validaEConfermaDocumento({
    documento_id: documentoId,
    dati_validati: datiValidati,
    data_scadenza: dataScadenza,
    aggiorna_costo_config: aggiornaCostoConfig && !!costoConfig,
    personale_id: personaleId,
    costo_config: costoConfig,
  });

  if (result.success) {
    revalidatePath(`/personale/${personaleId}/documenti`);
    revalidatePath("/personale");
  }

  return result;
}
