"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { confermaDocumento } from "./actions";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ShieldCheck,
  Stethoscope,
  ScrollText,
} from "lucide-react";

type Categoria = "contratto" | "visita_medica" | "corso_sicurezza";

interface ConfidenceField {
  valore: string | number | null;
  confidence: "high" | "medium" | "low";
  nota?: string;
}

interface AnalisiResponse {
  success: boolean;
  documento_id: string | null;
  url_file: string | null;
  categoria: Categoria;
  dati_estratti: Record<string, ConfidenceField>;
  campi_da_verificare: string[];
  riepilogo_ai: string;
  error?: string;
}

interface DocumentiClientProps {
  personaleId: string;
  personaleNome: string;
}

const CATEGORIE_INFO = {
  contratto: {
    label: "Contratto di Assunzione",
    icon: ScrollText,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  visita_medica: {
    label: "Certificato Medico",
    icon: Stethoscope,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  corso_sicurezza: {
    label: "Attestato Corso Sicurezza",
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
} as const;

const LABEL_CAMPI: Record<string, string> = {
  livello_inquadramento: "Livello Inquadramento",
  paga_base_lorda: "Paga Base Lorda (€)",
  paga_base_tipo: "Tipo Paga Base",
  coefficiente_straordinari: "Coeff. Straordinari",
  condizioni_trasferta: "Condizioni Trasferta",
  ccnl_applicato: "CCNL Applicato",
  data_assunzione: "Data Assunzione",
  data_scadenza: "Data Scadenza",
  aliquota_inps: "Aliquota INPS (%)",
  aliquota_inail: "Aliquota INAIL (%)",
  aliquota_edilcassa: "Aliquota Edilcassa (%)",
  tfr: "TFR (%)",
  incidenza_ferie: "Incidenza Ferie/Permessi (%)",
  costo_orario_reale_stimato: "Costo Orario Reale Stimato (€)",
  nominativo: "Nominativo",
  esito_o_tipo_corso: "Esito / Tipo Corso",
  data_effettuazione: "Data Effettuazione",
  medico_o_ente: "Medico / Ente",
  note: "Note",
};

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  if (confidence === "high")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" /> Alta
      </span>
    );
  if (confidence === "medium")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" /> Media
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
      <AlertTriangle className="h-3 w-3" /> Bassa - Verificare
    </span>
  );
}

export default function DocumentiClient({ personaleId, personaleNome }: DocumentiClientProps) {
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analisi, setAnalisi] = useState<AnalisiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) setSelectedFile(file);
    },
    []
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleAnalizza = async () => {
    if (!selectedFile || !categoria) return;
    setLoading(true);
    setError(null);
    setAnalisi(null);
    setSalvato(false);

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("categoria", categoria);
    fd.append("personale_id", personaleId);

    try {
      const res = await fetch("/api/personale/analizza-documento", {
        method: "POST",
        body: fd,
      });
      const data: AnalisiResponse = await res.json();
      if (!data.success) throw new Error(data.error || "Analisi fallita");
      setAnalisi(data);

      // Pre-popola i valori del form
      const initialValues: Record<string, string> = {};
      for (const [key, field] of Object.entries(data.dati_estratti)) {
        initialValues[key] = String(field.valore ?? "");
      }
      setFieldValues(initialValues);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'analisi");
    } finally {
      setLoading(false);
    }
  };

  const handleConferma = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!analisi?.documento_id) return;

    const fd = new FormData(e.currentTarget);
    fd.set("documento_id", analisi.documento_id);
    fd.set("personale_id", personaleId);
    fd.set("categoria", analisi.categoria);
    fd.set("aggiorna_costo_config", analisi.categoria === "contratto" ? "true" : "false");

    const result = await confermaDocumento(fd);
    if (result.success) {
      setSalvato(true);
      setAnalisi(null);
      setSelectedFile(null);
      setCategoria(null);
    } else {
      setError(result.error || "Salvataggio fallito");
    }
  };

  const resetForm = () => {
    setAnalisi(null);
    setSelectedFile(null);
    setCategoria(null);
    setError(null);
    setSalvato(false);
    setFieldValues({});
  };

  return (
    <div className="space-y-6">
      {salvato && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Documento salvato con successo!</p>
            <p className="text-sm text-green-700">
              Il profilo di costo è stato aggiornato per {personaleNome}.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetForm} className="ml-auto text-green-700">
            Carica altro
          </Button>
        </div>
      )}

      {/* STEP 1: Selezione categoria */}
      {!analisi && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Carica Documento per {personaleNome}
            </CardTitle>
            <CardDescription>
              Seleziona la tipologia di documento, poi trascina o seleziona il file.
              {"L'AI estrarrà automaticamente i dati per la revisione."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Selezione categoria */}
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-3 block">
                Tipologia Documento *
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(Object.entries(CATEGORIE_INFO) as [Categoria, typeof CATEGORIE_INFO[Categoria]][]).map(([key, info]) => {
                  const Icon = info.icon;
                  const isSelected = categoria === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategoria(key)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center ${
                        isSelected
                          ? `${info.border} ${info.bg} shadow-sm`
                          : "border-zinc-200 hover:border-zinc-300 bg-white"
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${isSelected ? info.color : "text-zinc-400"}`} />
                      <span
                        className={`text-sm font-medium ${
                          isSelected ? info.color : "text-zinc-600"
                        }`}
                      >
                        {info.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag & drop area */}
            {categoria && (
              <div>
                <Label className="text-sm font-medium text-zinc-700 mb-3 block">
                  File Documento *
                </Label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-blue-400 bg-blue-50"
                      : selectedFile
                      ? "border-green-400 bg-green-50"
                      : "border-zinc-300 hover:border-zinc-400 bg-zinc-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-green-600" />
                      <p className="text-sm font-medium text-green-700">{selectedFile.name}</p>
                      <p className="text-xs text-green-600">
                        {(selectedFile.size / 1024).toFixed(0)} KB — Pronto per l'analisi
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-zinc-500">
                      <Upload className="h-8 w-8 text-zinc-400" />
                      <p className="text-sm font-medium">
                        Trascina il file qui o clicca per selezionarlo
                      </p>
                      <p className="text-xs text-zinc-400">Supportati: JPG, PNG, PDF (max 10MB)</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleAnalizza}
              disabled={!selectedFile || !categoria || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisi AI in corso...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Analizza con AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Schermata validazione */}
      {analisi && (
        <Card className="border-amber-200">
          <CardHeader className="bg-amber-50/50 border-b border-amber-100">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Revisione Dati Estratti — Supervisione Umana Richiesta
                </CardTitle>
                <CardDescription className="text-amber-700 mt-1">
                  {analisi.riepilogo_ai}. Verifica i campi evidenziati prima di salvare.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {analisi.campi_da_verificare.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                <span className="text-xs text-amber-700 font-medium mr-1">Campi da verificare:</span>
                {analisi.campi_da_verificare.map((c) => (
                  <Badge key={c} variant="outline" className="text-xs border-amber-300 text-amber-700">
                    {LABEL_CAMPI[c] || c}
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleConferma} className="space-y-4">
              {/* Campo data scadenza separato */}
              <div className="space-y-1.5">
                <Label htmlFor="data_scadenza" className="text-sm font-medium">
                  Data Scadenza Documento
                </Label>
                <Input
                  id="data_scadenza"
                  name="data_scadenza"
                  type="date"
                  defaultValue={
                    (analisi.dati_estratti?.data_scadenza?.valore as string) || ""
                  }
                />
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                  Dati Estratti dal Documento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(analisi.dati_estratti).map(([campo, field]) => {
                    const isLowConfidence =
                      field.confidence === "low" || field.confidence === "medium";
                    const label = LABEL_CAMPI[campo] || campo;

                    return (
                      <div
                        key={campo}
                        className={`space-y-1.5 p-3 rounded-lg border ${
                          isLowConfidence
                            ? "border-amber-200 bg-amber-50/50"
                            : "border-zinc-100 bg-zinc-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label
                            htmlFor={campo}
                            className={`text-xs font-medium ${
                              isLowConfidence ? "text-amber-800" : "text-zinc-600"
                            }`}
                          >
                            {label}
                          </Label>
                          <ConfidenceBadge confidence={field.confidence} />
                        </div>
                        <Input
                          id={campo}
                          name={campo}
                          value={fieldValues[campo] ?? String(field.valore ?? "")}
                          onChange={(e) =>
                            setFieldValues((prev) => ({ ...prev, [campo]: e.target.value }))
                          }
                          className={`text-sm ${
                            isLowConfidence
                              ? "border-amber-300 focus:border-amber-500 bg-white"
                              : ""
                          }`}
                          placeholder="Campo non rilevato..."
                        />
                        {field.nota && (
                          <p className="text-xs text-zinc-400 italic">{field.nota}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="flex-1"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-green-700 hover:bg-green-800"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Conferma e Salva Profilo Costo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
