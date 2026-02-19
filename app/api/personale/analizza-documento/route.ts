// ============================================================
// API ROUTE: POST /api/personale/analizza-documento
// Riceve un file (multipart/form-data), lo carica su Storage,
// lo invia a Gemini per l'estrazione dati, e restituisce i
// dati estratti con confidence score per la supervisione umana.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseDocumentoPersonale } from "@/utils/ai/gemini";
import { getParametriGlobali } from "@/utils/data-fetcher";
import { createClient } from "@/utils/supabase/server";
import { uploadFileToSupabase } from "@/utils/supabase/upload";

const CATEGORIE_VALIDE = ["contratto", "visita_medica", "corso_sicurezza", "altro"] as const;
type CategoriaDoc = typeof CATEGORIE_VALIDE[number];

export async function POST(req: NextRequest) {
  try {
    // --- Auth check ---
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    // --- Parse multipart form ---
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const personale_id = formData.get("personale_id") as string | null;
    const categoria = formData.get("categoria") as string | null;

    if (!file || !personale_id || !categoria) {
      return NextResponse.json(
        { error: "Parametri mancanti: file, personale_id, categoria sono obbligatori" },
        { status: 400 }
      );
    }

    if (!CATEGORIE_VALIDE.includes(categoria as CategoriaDoc)) {
      return NextResponse.json(
        { error: `Categoria non valida. Usa: ${CATEGORIE_VALIDE.join(", ")}` },
        { status: 400 }
      );
    }

    // --- Upload file su Supabase Storage ---
    console.log(`📤 Upload documento: ${file.name} (${file.type}, ${file.size} bytes)`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicUrl = await uploadFileToSupabase(buffer, file.name, file.type);

    if (!publicUrl) {
      return NextResponse.json(
        { error: "Errore durante il caricamento del file su Storage" },
        { status: 500 }
      );
    }

    console.log(`✅ File caricato: ${publicUrl}`);

    // --- Prepara media per Gemini ---
    const base64 = buffer.toString("base64");
    const media = { base64, mimeType: file.type };

    // --- Carica parametri globali per RAG (solo per contratti) ---
    let parametriPerGemini: Parameters<typeof parseDocumentoPersonale>[2] = null;
    if (categoria === "contratto") {
      const pg = await getParametriGlobali();
      if (pg?.aliquote_ccnl) {
        parametriPerGemini = { aliquote_ccnl: pg.aliquote_ccnl };
      } else {
        console.warn("⚠️ Parametri CCNL non trovati, calcolo costo senza RAG");
      }
    }

    // --- Analisi AI ---
    console.log(`🤖 Avvio analisi AI: categoria=${categoria}`);
    const datiEstrattiRaw = await parseDocumentoPersonale(
      media,
      categoria as CategoriaDoc,
      parametriPerGemini
    );

    console.log("✅ Analisi AI completata");

    return NextResponse.json({
      success: true,
      url_file: publicUrl,
      nome_file: file.name,
      categoria,
      personale_id,
      dati_estratti: datiEstrattiRaw,
    });

  } catch (error) {
    console.error("🔥 Errore analizza-documento:", error);
    return NextResponse.json(
      { error: "Errore interno del server durante l'analisi" },
      { status: 500 }
    );
  }
}
