import { createClient } from "@/utils/supabase/server";
import { getDocumentiPersonale } from "@/utils/data-fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  FileText,
  ShieldCheck,
  Stethoscope,
  ScrollText,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import DocumentiClient from "./DocumentiClient";
import { notFound } from "next/navigation";

const CATEGORIE_LABEL: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  contratto: { label: "Contratto", Icon: ScrollText, color: "text-blue-600" },
  visita_medica: { label: "Visita Medica", Icon: Stethoscope, color: "text-green-600" },
  corso_sicurezza: { label: "Corso Sicurezza", Icon: ShieldCheck, color: "text-amber-600" },
};

function StatoBadge({ stato, dataScadenza }: { stato: string; dataScadenza: string | null }) {
  const oggi = new Date();
  const scadenza = dataScadenza ? new Date(dataScadenza) : null;
  const giorniAllaScadenza = scadenza
    ? Math.ceil((scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (stato === "bozza") {
    return (
      <Badge variant="outline" className="border-zinc-300 text-zinc-500 text-xs">
        <Clock className="h-3 w-3 mr-1" /> Bozza
      </Badge>
    );
  }

  if (giorniAllaScadenza !== null && giorniAllaScadenza <= 30) {
    return (
      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-xs">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {giorniAllaScadenza <= 0 ? "Scaduto" : `Scade in ${giorniAllaScadenza}gg`}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 text-xs">
      <CheckCircle2 className="h-3 w-3 mr-1" /> Validato
    </Badge>
  );
}

export default async function DocumentiPersonalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: persona, error } = await supabase
    .from("personale")
    .select("id, nome, ruolo, costo_orario, costo_config")
    .eq("id", id)
    .single();

  if (error || !persona) notFound();

  const documenti = await getDocumentiPersonale(id);

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/personale"
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Torna al Personale
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" />
            Documenti — {persona.nome}
          </h1>
          <p className="text-zinc-500 mt-1">
            {persona.ruolo} · Gestione documenti, contratti e scadenziario
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Lista documenti */}
          <div className="lg:col-span-3 space-y-6">
            {/* Profilo Costo Attuale */}
            {persona.costo_config && Object.keys(persona.costo_config).length > 0 && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    Profilo di Costo Configurato
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {[
                      ["Livello", (persona.costo_config as Record<string, string>).livello_inquadramento],
                      ["Paga Base", `€ ${(persona.costo_config as Record<string, number>).paga_base}`],
                      ["INPS", `${(((persona.costo_config as Record<string, number>).aliquota_inps || 0) * 100).toFixed(2)}%`],
                      ["INAIL", `${(((persona.costo_config as Record<string, number>).aliquota_inail || 0) * 100).toFixed(2)}%`],
                      ["Edilcassa", `${(((persona.costo_config as Record<string, number>).aliquota_edilcassa || 0) * 100).toFixed(2)}%`],
                      ["TFR", "7.41%"],
                    ].map(([k, v]) =>
                      v ? (
                        <div key={k} className="bg-white/80 rounded p-2 border border-blue-100">
                          <p className="text-zinc-500">{k}</p>
                          <p className="font-semibold text-zinc-800">{v}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabella documenti */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Archivio Documenti ({documenti.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {documenti.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400 border border-dashed rounded-lg text-sm">
                    Nessun documento caricato.
                    <br />
                    Usa il modulo a destra per iniziare.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Scadenza</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>File</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documenti.map((doc) => {
                        const cat =
                          CATEGORIE_LABEL[doc.categoria_documento] ||
                          CATEGORIE_LABEL.contratto;
                        const Icon = cat.Icon;
                        return (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${cat.color}`} />
                                <span className="text-sm font-medium">{cat.label}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {doc.data_scadenza
                                ? new Date(doc.data_scadenza).toLocaleDateString("it-IT")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <StatoBadge
                                stato={doc.stato}
                                dataScadenza={doc.data_scadenza}
                              />
                            </TableCell>
                            <TableCell>
                              {doc.url_file ? (
                                <a
                                  href={doc.url_file}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  <FileText className="h-3 w-3" /> Apri
                                </a>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Form upload a destra */}
          <div className="lg:col-span-2">
            <DocumentiClient personaleId={id} personaleNome={persona.nome} />
          </div>
        </div>
      </div>
    </div>
  );
}
