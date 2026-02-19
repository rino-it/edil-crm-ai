// ============================================================
// PAGE: /personale/[id]/documenti
// Server Component: carica dati personale + documenti esistenti,
// poi passa tutto al DocumentiClient per la gestione interattiva.
// ============================================================

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getDocumentiPersonale } from "@/utils/data-fetcher";
import DocumentiClient from "./DocumentiClient";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentiPersonalePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  // Carica dati personale
  const { data: persona, error } = await supabase
    .from("personale")
    .select("id, nome, ruolo, costo_orario, attivo")
    .eq("id", id)
    .single();

  if (error || !persona) {
    notFound();
  }

  // Carica documenti esistenti
  const documenti = await getDocumentiPersonale(id);

  // Conta documenti per stato
  const bozze = documenti.filter((d) => d.stato === "bozza").length;
  const validati = documenti.filter((d) => d.stato === "validato").length;

  // Documenti in scadenza (entro 30 giorni)
  const oggi = new Date();
  const limite = new Date();
  limite.setDate(oggi.getDate() + 30);
  const inScadenza = documenti.filter((d) => {
    if (!d.data_scadenza || d.stato !== "validato") return false;
    const scad = new Date(d.data_scadenza);
    return scad >= oggi && scad <= limite;
  }).length;

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex items-center gap-4">
          <Link href="/personale">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Torna al Personale
            </Button>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" />
              Documenti — {persona.nome}
            </h1>
            <p className="text-zinc-500 mt-1">
              {persona.ruolo || "Nessun ruolo"} ·{" "}
              Costo attuale:{" "}
              <strong className="text-zinc-700">
                € {persona.costo_orario?.toFixed(2) ?? "0.00"} / h
              </strong>
            </p>
          </div>

          {/* Statistiche rapide */}
          <div className="flex gap-3">
            {bozze > 0 && (
              <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                <div className="text-xl font-bold text-yellow-700">{bozze}</div>
                <div className="text-xs text-yellow-600">Da validare</div>
              </div>
            )}
            <div className="text-center bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-xl font-bold text-green-700">{validati}</div>
              <div className="text-xs text-green-600">Validati</div>
            </div>
            {inScadenza > 0 && (
              <div className="text-center bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                <div className="text-xl font-bold text-red-700">{inScadenza}</div>
                <div className="text-xs text-red-600">In scadenza</div>
              </div>
            )}
          </div>
        </div>

        {/* CLIENT COMPONENT */}
        <DocumentiClient
          personaleId={id}
          personaleNome={persona.nome}
          documentiEsistenti={documenti}
        />

      </div>
    </div>
  );
}
