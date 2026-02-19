// ============================================================
// API ROUTE: Analisi documento personale con Gemini Vision
// POST /api/personale/analizza-documento
//
// Riceve: multipart/form-data con file + categoria + personale_id
// Restituisce: dati_estratti con confidence scores
// NON salva nel DB — solo analisi AI per pre-compilare il form
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseDocumentoPersonale, CategoriaDocumento } from "@/utils/ai/gemini";
import { getParametriGlobali, salvaDocumentoBozza } from "@/utils/data-fetcher";
import { uploadFileToSupabase } from "@/utils/supabase/upload";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const categoria = formData.get("categoria") as CategoriaDocumento | null;
    const personaleId = formData.get("personale_id") as string | null;

    if (!file || !categoria || !personaleId) {
      return NextResponse.json(
        { error: "Parametri mancanti: file, categoria e personale_id sono obbligatori" },
        { status: 400 }
      );
    }

    const categoriePossibili: CategoriaDocumento[] = [
      "contratto",
      "visita_medica",
      "corso_sicurezza",
    ];
    if (!categoriePossibili.includes(categoria)) {
      return NextResponse.json(
        { error: "Categoria non valida. Usare: contratto, visita_medica, corso_sicurezza" },
        { status: 400 }
      );
    }

    // 1. Leggi file come buffer e converti in base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    console.log(
      `📄 Analisi documento: ${categoria} | File: ${file.name} | Dimensione: ${buffer.length}B`
    );

    // 2. Upload su Supabase Storage (bucket cantiere-docs)
    const fileName = `personale/${personaleId}/${categoria}_${Date.now()}_${file.name}`;
    let urlFile: string | null = null;

    try {
      urlFile = await uploadFileToSupabase(buffer, fileName, mimeType);
    } catch (uploadErr) {
      console.warn("⚠️ Upload file fallito, procedo senza URL:", uploadErr);
    }

    // 3. Leggi parametri globali (Knowledge Base CCNL)
    const parametriGlobali = await getParametriGlobali();

    // 4. Analisi Gemini Vision
    const risultatoAI = await parseDocumentoPersonale(
      { base64, mimeType },
      categoria,
      parametriGlobali
    );

    // 5. Salva bozza nel DB (dati_estratti, NON dati_validati)
    let documentoId: string | null = null;
    let dataScadenza: string | null = null;

    // Estrai data_scadenza dai dati estratti
    const datiRaw = risultatoAI.dati_estratti as Record<string, { valore: string | null }>;
    if (categoria === "contratto") {
      dataScadenza = datiRaw?.data_scadenza?.valore || null;
    } else {
      dataScadenza = datiRaw?.data_scadenza?.valore || null;
    }

    const salvataggio = await salvaDocumentoBozza({
      personale_id: personaleId,
      url_file: urlFile,
      categoria_documento: categoria,
      dati_estratti: risultatoAI.dati_estratti as Record<string, unknown>,
      data_scadenza: dataScadenza,
    });

    if (salvataggio.success) {
      documentoId = salvataggio.id || null;
    }

    return NextResponse.json({
      success: true,
      documento_id: documentoId,
      url_file: urlFile,
      categoria,
      dati_estratti: risultatoAI.dati_estratti,
      campi_da_verificare: risultatoAI.campi_da_verificare,
      riepilogo_ai: risultatoAI.riepilogo_ai,
    });
  } catch (error) {
    console.error("🔥 Errore analisi documento:", error);
    return NextResponse.json(
      { error: "Errore interno del server durante l'analisi del documento" },
      { status: 500 }
    );
  }
}
