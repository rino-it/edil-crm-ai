'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, AlertCircle, SplitSquareVertical, MapPin, FileText, CalendarDays, FileQuestion } from "lucide-react"
import { salvaAssegnazioneCantiere, aggiornaAliquotaIva } from '../actions'

interface Cantiere {
  id: string;
  label: string;
}

interface AssegnaCantiereModalProps {
  scadenzaId: string;
  importoTotale: number;
  importoResiduo: number;
  cantieri: Cantiere[];
  currentCantiereId?: string | null;
  soggettoNome?: string;
  descrizione?: string | null;
  fatturaRiferimento?: string | null;
  dataScadenza?: string;
  tipo?: 'entrata' | 'uscita';
  fileUrl?: string | null;
  currentAliquotaIva?: number | null;
  children?: React.ReactNode;
}

export function AssegnaCantiereModal({
  scadenzaId,
  importoTotale,
  importoResiduo,
  cantieri,
  currentCantiereId,
  soggettoNome,
  descrizione,
  fatturaRiferimento,
  dataScadenza,
  tipo,
  fileUrl,
  currentAliquotaIva,
  children
}: AssegnaCantiereModalProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [mode, setMode] = useState<'singolo' | 'multiplo'>('singolo')
  const [singleCantiere, setSingleCantiere] = useState<string>(currentCantiereId || '')

  const importoAllocabile = importoResiduo > 0 ? importoResiduo : importoTotale
  const [allocazioni, setAllocazioni] = useState<{ cantiere_id: string; importo: number }[]>([
    { cantiere_id: '', importo: importoAllocabile }
  ])

  const [aliquotaIva, setAliquotaIva] = useState(currentAliquotaIva ?? 22)
  const ivaGenerata = Math.round((importoAllocabile / (100 + aliquotaIva)) * aliquotaIva * 100) / 100
  const imponibile = Math.round((importoAllocabile - ivaGenerata) * 100) / 100

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  const sommaAllocata = allocazioni.reduce((acc, curr) => acc + (Number(curr.importo) || 0), 0)
  const residuo = Math.round((importoAllocabile - sommaAllocata) * 100) / 100
  const isMultiValid = allocazioni.every(a => a.cantiere_id !== '' && a.importo > 0) && residuo === 0

  const handleAddRiga = () => {
    setAllocazioni([...allocazioni, { cantiere_id: '', importo: Math.max(0, residuo) }])
  }

  const handleRemoveRiga = (index: number) => {
    setAllocazioni(allocazioni.filter((_, i) => i !== index))
  }

  const handleChangeRiga = (index: number, field: 'cantiere_id' | 'importo', value: any) => {
    const nuoveAllocazioni = [...allocazioni]
    if (field === 'importo') {
      nuoveAllocazioni[index].importo = value === '' ? 0 : parseFloat(value)
    } else {
      nuoveAllocazioni[index].cantiere_id = value
    }
    setAllocazioni(nuoveAllocazioni)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const data = mode === 'singolo'
        ? { mode: 'singolo' as const, cantiere_id: singleCantiere }
        : { mode: 'multiplo' as const, allocazioni }

      await Promise.all([
        salvaAssegnazioneCantiere(scadenzaId, data),
        aggiornaAliquotaIva(scadenzaId, aliquotaIva),
      ])
      setIsOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Errore salvataggio:", error)
      alert("Si è verificato un errore durante il salvataggio.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasPdf = !!fileUrl

  // ─── Form assegnazione (colonna destra o unica) ──────────────────
  const formContent = (
    <div className="flex flex-col h-full">
      {/* Header riepilogo fattura */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="font-bold text-zinc-900 text-sm">{soggettoNome || 'Soggetto non specificato'}</div>
            {descrizione && (
              <div className="text-xs text-zinc-600 leading-relaxed">{descrizione}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              {fatturaRiferimento && (
                <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">{fatturaRiferimento}</span>
              )}
              {dataScadenza && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={11} /> Scad. {new Date(dataScadenza).toLocaleDateString('it-IT')}
                </span>
              )}
              {tipo && (
                <Badge variant="outline" className={`text-[10px] ${tipo === 'entrata' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {tipo === 'entrata' ? 'ENTRATA' : 'USCITA'}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right space-y-0.5 ml-3 flex-shrink-0">
            <div className="font-mono font-black text-zinc-900">{formatEuro(importoTotale)}</div>
            {importoResiduo > 0 && importoResiduo < importoTotale && (
              <div className="text-[10px] text-rose-600 font-mono">Residuo: {formatEuro(importoResiduo)}</div>
            )}
          </div>
        </div>
        {!hasPdf && (
          <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-zinc-100 text-zinc-400 border border-zinc-200">
            <FileQuestion size={12} /> PDF non disponibile
          </div>
        )}
      </div>

      {/* IVA / Scorporo */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/30 p-2.5 mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Aliquota IVA</div>
          <select
            value={aliquotaIva}
            onChange={(e) => setAliquotaIva(Number(e.target.value))}
            className="text-xs font-mono font-bold text-zinc-700 bg-white border border-zinc-200 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value={0}>0% (Esente)</option>
            <option value={4}>4%</option>
            <option value={10}>10%</option>
            <option value={22}>22%</option>
          </select>
        </div>
        {/* Costo Cantiere (imponibile) */}
        <div className="flex items-center justify-between rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1.5">
          <div className="text-xs font-semibold text-blue-800">Costo Cantiere</div>
          <span className="font-mono font-black text-blue-900 text-sm">{formatEuro(imponibile)}</span>
        </div>
        {/* Credito IVA (va nel Saldo IVA globale) */}
        <div className="flex items-center justify-between rounded-md bg-purple-50 border border-purple-200 px-2.5 py-1.5">
          <div className="text-xs text-purple-700">
            <span className="font-semibold">Credito IVA</span>
            <span className="text-[10px] text-purple-500 ml-1">(Saldo IVA)</span>
          </div>
          <span className="font-mono font-bold text-purple-800 text-sm">{formatEuro(ivaGenerata)}</span>
        </div>
      </div>

      {/* Selettore modalità + form cantiere */}
      <div className="mt-3 flex-1 overflow-y-auto space-y-3">
        <div className="flex p-1 bg-zinc-100 rounded-lg">
          <button
            onClick={() => setMode('singolo')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'singolo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Cantiere Singolo
          </button>
          <button
            onClick={() => setMode('multiplo')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'multiplo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            <SplitSquareVertical size={14} /> Dividi Importo
          </button>
        </div>

        {mode === 'singolo' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Seleziona cantiere</label>
            <select
              value={singleCantiere}
              onChange={(e) => setSingleCantiere(e.target.value)}
              className="w-full h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">-- Nessun cantiere (Da Smistare) --</option>
              {cantieri.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'multiplo' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {allocazioni.map((allocazione, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1">
                    <select
                      value={allocazione.cantiere_id}
                      onChange={(e) => handleChangeRiga(index, 'cantiere_id', e.target.value)}
                      className={`w-full h-9 rounded-md border ${!allocazione.cantiere_id ? 'border-rose-300 bg-rose-50' : 'border-zinc-200'} bg-white px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none`}
                    >
                      <option value="">-- Seleziona Cantiere --</option>
                      {cantieri.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">€</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={allocazione.importo || ''}
                      onChange={(e) => handleChangeRiga(index, 'importo', e.target.value)}
                      className="pl-6 pr-2 h-9 font-mono text-right text-sm border-zinc-200"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0 h-9 w-9"
                    onClick={() => handleRemoveRiga(index)}
                    disabled={allocazioni.length === 1}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={handleAddRiga} className="w-full border-dashed text-blue-600 border-blue-200 hover:bg-blue-50 h-8">
              <Plus size={14} className="mr-1.5" /> Aggiungi Cantiere
            </Button>

            <div className={`p-3 rounded-lg border ${residuo === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-600">Da allocare:</span>
                <span className="font-mono font-bold">{formatEuro(importoAllocabile)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-600">Assegnato:</span>
                <span className="font-mono">{formatEuro(sommaAllocata)}</span>
              </div>
              <div className="border-t border-zinc-200/50 my-1.5 pt-1.5 flex justify-between items-center">
                <span className={`text-sm font-bold ${residuo === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Restante:</span>
                <span className={`font-mono font-black ${residuo === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatEuro(residuo)}
                </span>
              </div>
              {residuo !== 0 && (
                <div className="mt-1.5 text-xs text-rose-600 flex items-center gap-1">
                  <AlertCircle size={12} /> Deve corrispondere al totale.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-zinc-200">
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>Annulla</Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || (mode === 'multiplo' && !isMultiValid)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? 'Salvataggio...' : 'Salva Assegnazione'}
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-dashed">
            <MapPin className="h-3 w-3 mr-1.5" />
            {currentCantiereId ? 'Modifica Cantiere' : 'Assegna Cantiere'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={`bg-white p-0 gap-0 ${hasPdf ? 'sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-[1200px] h-[85vh]' : 'sm:max-w-[600px]'}`}>

        {hasPdf ? (
          /* ═══ LAYOUT SPLIT: PDF a sinistra + Form a destra ═══ */
          <div className="flex h-full">
            {/* Colonna sinistra: PDF viewer */}
            <div className="flex-1 border-r border-zinc-200 bg-zinc-100 flex flex-col min-w-0">
              <div className="px-4 py-2.5 border-b border-zinc-200 bg-white flex items-center gap-2">
                <FileText size={14} className="text-blue-600" />
                <span className="text-sm font-semibold text-zinc-700">Fattura PDF</span>
                <a href={fileUrl!} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-blue-600 hover:underline">
                  Apri in nuova scheda
                </a>
              </div>
              <div className="flex-1 min-h-0">
                <iframe
                  src={fileUrl!}
                  className="w-full h-full border-0"
                  title="Anteprima fattura PDF"
                />
              </div>
            </div>

            {/* Colonna destra: form assegnazione */}
            <div className="w-[420px] flex-shrink-0 flex flex-col">
              <div className="px-4 py-2.5 border-b border-zinc-200">
                <h2 className="text-base font-bold text-zinc-900">Assegnazione Cantiere</h2>
                <p className="text-xs text-zinc-500">Associa a uno o più cantieri</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
                {formContent}
              </div>
            </div>
          </div>

        ) : (
          /* ═══ LAYOUT SINGOLO: solo form (no PDF) ═══ */
          <div className="p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl">Assegnazione Cantiere</DialogTitle>
              <DialogDescription>
                Associa questa fattura a uno o più cantieri.
              </DialogDescription>
            </DialogHeader>
            {formContent}
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
