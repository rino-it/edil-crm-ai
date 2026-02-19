"use client";

// ============================================================
// CLIENT COMPONENT: Gestione documenti personale
// - Drag & drop upload
// - Analisi AI con confidence badge
// - Form validazione umana obbligatoria prima del salvataggio
// ============================================================

import { useState, useCallback, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle,
  Clock, Euro, Calendar, User, Loader2, Eye
} from "lucide-react";
import { confermaDocumentoAction, rifiutaDocumentoAction } from "./actions";
import type { DocumentoPersonale } from "@/utils/data-fetcher";

// ============================================================
// TIPI
// ============================================================

interface ConfidenceField {
  value: string | number | null;
  confidence: number;
  raw_text?: string;
}

interface DatiEstrattiContratto {
  nome_dipendente?: ConfidenceField;
  livello_ccnl?: ConfidenceField;
  paga_base_oraria?: ConfidenceField;
  ore_settimanali?: ConfidenceField;
  data_assunzione?: ConfidenceField;
  data_scadenza_contratto?: ConfidenceField;
  tipo_contratto?: ConfidenceField;
  costo_orario_reale_stimato?: number | null;
}

interface DatiEstrattiSanitario {
  nome_dipendente?: ConfidenceField;
  tipo_documento?: ConfidenceField;
  data_emissione?: ConfidenceField;
  data_scadenza?: ConfidenceField;
  esito?: ConfidenceField;
  ente_emittente?: ConfidenceField;
  note?: ConfidenceField;
}

type DatiEstratti = DatiEstrattiContratto | DatiEstrattiSanitario;

interface AnalisiResult {
  url_file: string;
  nome_file: string;
  categoria: string;
  dati_estratti: DatiEstratti;
}

interface Props {
  personaleId: string;
  personaleNome: string;
  documentiEsistenti: DocumentoPersonale[];
}

// ============================================================
// HELPER: Confidence Badge
// ============================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  if (pct >= 85) return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
      <CheckCircle className="h-3 w-3" /> {pct}%
    </span>
  );
  if (pct >= 60) return (
    <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded">
      <AlertTriangle className="h-3 w-3" /> {pct}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
      <XCircle className="h-3 w-3" /> {pct}%
    </span>
  );
}

// ============================================================
// HELPER: Stato documento badge
// ============================================================

function StatoBadge({ stato }: { stato: string }) {
  if (stato === "validato") return (
    <Badge className="bg-green-100 text-green-800 border-green-200">✅ Validato</Badge>
  );
  if (stato === "rifiutato") return (
    <Badge className="bg-red-100 text-red-800 border-red-200">❌ Rifiutato</Badge>
  );
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">⏳ Bozza</Badge>;
}

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function DocumentiClient({ personaleId, personaleNome, documentiEsistenti }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [categoria, setCategoria] = useState<string>("contratto");
  const [analisiResult, setAnalisiResult] = useState<AnalisiResult | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Campi editabili per la validazione umana
  const [campiValidati, setCampiValidati] = useState<Record<string, string>>({});
  const [dataScadenza, setDataScadenza] = useState("");
  const [costoOrario, setCostoOrario] = useState("");

  // ============================================================
  // DRAG & DROP
  // ============================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ============================================================
  // UPLOAD + ANALISI AI
  // ============================================================

  async function processFile(file: File) {
    setErrore(null);
    setAnalisiResult(null);
    setCampiValidati({});
    setDataScadenza("");
    setCostoOrario("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("personale_id", personaleId);
      formData.append("categoria", categoria);

      const res = await fetch("/api/personale/analizza-documento", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Errore analisi documento");
      }

      setAnalisiResult(data);

      // Pre-popola i campi editabili con i valori estratti dall'AI
      const dati = data.dati_estratti as Record<string, ConfidenceField | number | null>;
      const precompilati: Record<string, string> = {};
      for (const [key, val] of Object.entries(dati)) {
        if (val && typeof val === "object" && "value" in val && val.value !== null) {
          precompilati[key] = String(val.value);
        }
      }
      setCampiValidati(precompilati);

      // Pre-popola data scadenza e costo orario se disponibili
      if (categoria === "contratto") {
        const d = data.dati_estratti as DatiEstrattiContratto;
        if (d.data_scadenza_contratto?.value) setDataScadenza(String(d.data_scadenza_contratto.value));
        if (d.costo_orario_reale_stimato) setCostoOrario(String(d.costo_orario_reale_stimato));
      } else {
        const d = data.dati_estratti as DatiEstrattiSanitario;
        if (d.data_scadenza?.value) setDataScadenza(String(d.data_scadenza.value));
      }

    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setIsUploading(false);
    }
  }

  // ============================================================
  // CONFERMA (supervisione umana → salva validato)
  // ============================================================

  function handleConferma() {
    if (!analisiResult) return;
    startTransition(async () => {
      // Prima salva la bozza
      const bozzaForm = new FormData();
      bozzaForm.append("personale_id", personaleId);
      bozzaForm.append("nome_file", analisiResult.nome_file);
      bozzaForm.append("url_file", analisiResult.url_file);
      bozzaForm.append("categoria", analisiResult.categoria);
      bozzaForm.append("dati_estratti", JSON.stringify(analisiResult.dati_estratti));
      bozzaForm.append("data_scadenza", dataScadenza);

      const { salvaBozzaAction } = await import("./actions");
      const bozzaResult = await salvaBozzaAction(bozzaForm);

      if (!bozzaResult.success || !bozzaResult.id) {
        setErrore("Errore salvataggio bozza");
        return;
      }

      // Poi conferma con i dati validati dall'utente
      const confermaForm = new FormData();
      confermaForm.append("documento_id", bozzaResult.id);
      confermaForm.append("personale_id", personaleId);
      confermaForm.append("dati_validati", JSON.stringify(campiValidati));
      confermaForm.append("data_scadenza", dataScadenza);
      if (costoOrario) confermaForm.append("costo_orario_reale", costoOrario);

      await confermaDocumentoAction(confermaForm);
      setAnalisiResult(null);
    });
  }

  // ============================================================
  // RIFIUTA documento esistente in bozza
  // ============================================================

  function handleRifiuta(documentoId: string) {
    startTransition(async () => {
      const form = new FormData();
      form.append("documento_id", documentoId);
      form.append("personale_id", personaleId);
      await rifiutaDocumentoAction(form);
    });
  }

  // ============================================================
  // RENDER CAMPI ESTRATTI con confidence badge
  // ============================================================

  function renderCampiEstratti(dati: DatiEstratti) {
    const etichette: Record<string, string> = {
      nome_dipendente: "Nome Dipendente",
      livello_ccnl: "Livello CCNL",
      paga_base_oraria: "Paga Base Oraria (€/h)",
      ore_settimanali: "Ore Settimanali",
      data_assunzione: "Data Assunzione",
      data_scadenza_contratto: "Scadenza Contratto",
      tipo_contratto: "Tipo Contratto",
      tipo_documento: "Tipo Documento",
      data_emissione: "Data Emissione",
      data_scadenza: "Data Scadenza",
      esito: "Esito",
      ente_emittente: "Ente Emittente",
      note: "Note",
    };

    return Object.entries(dati)
      .filter(([key]) => key !== "costo_orario_reale_stimato")
      .map(([key, field]) => {
        if (!field || typeof field !== "object" || !("confidence" in field)) return null;
        const cf = field as ConfidenceField;
        const label = etichette[key] || key;
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-500">{label}</Label>
              <ConfidenceBadge confidence={cf.confidence} />
            </div>
            <Input
              value={campiValidati[key] ?? (cf.value !== null ? String(cf.value) : "")}
              onChange={(e) => setCampiValidati(prev => ({ ...prev, [key]: e.target.value }))}
              className="h-8 text-sm"
              placeholder={cf.raw_text || "Non rilevato"}
            />
          </div>
        );
      });
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-8">

      {/* UPLOAD AREA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Carica Nuovo Documento
          </CardTitle>
          <CardDescription>
            Trascina un file o clicca per selezionarlo. L&apos;AI estrarrà i dati automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Selezione categoria */}
          <div className="flex gap-2 flex-wrap">
            {[
              { value: "contratto", label: "📄 Contratto" },
              { value: "visita_medica", label: "🏥 Visita Medica" },
              { value: "corso_sicurezza", label: "🦺 Corso Sicurezza" },
              { value: "altro", label: "📎 Altro" },
            ].map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoria(cat.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  categoria === cat.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-zinc-300 hover:border-blue-400 hover:bg-zinc-50"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3 text-blue-600">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="font-medium">Analisi AI in corso...</p>
                <p className="text-sm text-zinc-500">Gemini sta leggendo il documento</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-zinc-400">
                <FileText className="h-10 w-10" />
                <p className="font-medium text-zinc-600">Trascina il documento qui</p>
                <p className="text-sm">oppure clicca per selezionare (PDF, JPG, PNG)</p>
              </div>
            )}
          </div>
          <input
            id="file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileInput}
          />

          {errore && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              {errore}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PANNELLO VALIDAZIONE UMANA */}
      {analisiResult && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Eye className="h-5 w-5" />
              Supervisione Umana Richiesta
            </CardTitle>
            <CardDescription>
              Verifica i dati estratti dall&apos;AI. I campi con badge rosso/giallo richiedono attenzione.
              <strong className="text-blue-700"> Il documento NON viene salvato finché non confermi.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* File info */}
            <div className="flex items-center gap-2 text-sm text-zinc-600 bg-white rounded-lg p-3 border">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{analisiResult.nome_file}</span>
              <Badge variant="outline" className="ml-auto">{analisiResult.categoria}</Badge>
            </div>

            {/* Costo orario stimato (solo contratti) */}
            {analisiResult.categoria === "contratto" && (
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-3">
                  <Euro className="h-4 w-4 text-green-600" />
                  <span className="font-semibold text-green-800">Costo Orario Reale Stimato (RAG)</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Costo Calcolato dall&apos;AI (€/h)</Label>
                    <div className="text-2xl font-bold text-green-700">
                      {(analisiResult.dati_estratti as DatiEstrattiContratto).costo_orario_reale_stimato
                        ? `€ ${(analisiResult.dati_estratti as DatiEstrattiContratto).costo_orario_reale_stimato?.toFixed(2)}`
                        : "Non calcolato"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">Costo da Salvare (modificabile)</Label>
                    <div className="relative">
                      <Euro className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                      <Input
                        type="number"
                        step="0.01"
                        value={costoOrario}
                        onChange={(e) => setCostoOrario(e.target.value)}
                        className="pl-8"
                        placeholder="Es. 16.45"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Campi estratti */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderCampiEstratti(analisiResult.dati_estratti)}
            </div>

            {/* Data scadenza */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-500" />
                <Label className="text-sm">Data Scadenza Documento</Label>
              </div>
              <Input
                type="date"
                value={dataScadenza}
                onChange={(e) => setDataScadenza(e.target.value)}
                className="max-w-xs"
              />
            </div>

            <Separator />

            {/* Bottoni azione */}
            <div className="flex gap-3">
              <Button
                onClick={handleConferma}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-2" /> Conferma e Salva</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAnalisiResult(null)}
                disabled={isPending}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" /> Annulla
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* LISTA DOCUMENTI ESISTENTI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-zinc-600" />
            Documenti di {personaleNome}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documentiEsistenti.length === 0 ? (
            <div className="text-center py-10 text-zinc-400 border border-dashed rounded-lg">
              Nessun documento caricato ancora.
            </div>
          ) : (
            <div className="space-y-3">
              {documentiEsistenti.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-white border rounded-lg hover:border-zinc-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{doc.nome_file}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-400">{doc.categoria}</span>
                        {doc.data_scadenza && (
                          <span className="flex items-center gap-1 text-xs text-zinc-400">
                            <Clock className="h-3 w-3" />
                            Scade: {new Date(doc.data_scadenza).toLocaleDateString("it-IT")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatoBadge stato={doc.stato} />
                    {doc.url_file && (
                      <a
                        href={doc.url_file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Apri
                      </a>
                    )}
                    {doc.stato === "bozza" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRifiuta(doc.id)}
                        disabled={isPending}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
