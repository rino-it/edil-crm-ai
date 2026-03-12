'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, AlertCircle, SplitSquareVertical, MapPin, FileText, CalendarDays, FileQuestion, Package, Loader2, Lock, ChevronDown, ChevronRight } from "lucide-react"
import { salvaAssegnazioneCantiere, aggiornaAliquotaIva, getRighePerScadenza, salvaAssegnazioneDDT } from '../actions'
import type { RigheScadenzaResult, GruppoDDT } from '../actions'

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

  // ─── Modalita: singolo | multiplo | ddt ─────────────────────────
  const [mode, setMode] = useState<'singolo' | 'multiplo' | 'ddt'>('singolo')
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

  // ─── DDT State ──────────────────────────────────────────────────
  const [ddtData, setDdtData] = useState<RigheScadenzaResult | null>(null)
  const [ddtLoading, setDdtLoading] = useState(false)
  const [ddtError, setDdtError] = useState<string | null>(null)
  const [ddtAssegnazioni, setDdtAssegnazioni] = useState<Map<string | null, string>>(new Map())
  const [ddtManualeCantiere, setDdtManualeCantiere] = useState<string>('')
  const [ddtExpandedGroups, setDdtExpandedGroups] = useState<Set<string | null>>(new Set())
  const [ddtOverrideMode, setDdtOverrideMode] = useState(false)

  const loadDdtData = useCallback(async () => {
    setDdtLoading(true)
    setDdtError(null)
    try {
      const result = await getRighePerScadenza(scadenzaId)
      setDdtData(result)

      // Pre-popola assegnazioni con suggerimenti
      const initial = new Map<string | null, string>()
      for (const g of result.gruppi_ddt) {
        if (g.ddt_riferimento !== null && g.cantiere_suggerito) {
          initial.set(g.ddt_riferimento, g.cantiere_suggerito.id)
        }
      }

      // Se gia allocata, popola anche da allocazioni esistenti
      if (result.gia_allocata && result.allocazioni_esistenti.length > 0) {
        for (const ae of result.allocazioni_esistenti) {
          if (ae.ddt_riferimento && !initial.has(ae.ddt_riferimento)) {
            initial.set(ae.ddt_riferimento, ae.cantiere_id)
          }
        }
      }

      setDdtAssegnazioni(initial)

      // Auto-switch a modalita DDT se ci sono gruppi con DDT
      const hasDdtGruppi = result.gruppi_ddt.some(g => g.ddt_riferimento !== null)
      if (hasDdtGruppi) {
        setMode('ddt')
      }
    } catch (e) {
      setDdtError('Errore caricamento righe DDT')
      console.error(e)
    } finally {
      setDdtLoading(false)
    }
  }, [scadenzaId])

  useEffect(() => {
    if (isOpen) {
      loadDdtData()
    }
  }, [isOpen, loadDdtData])

  // ─── Handler classici ───────────────────────────────────────────
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

  // ─── DDT handlers ──────────────────────────────────────────────
  const handleDdtCantiereChange = (ddtRef: string | null, cantiereId: string) => {
    setDdtAssegnazioni(prev => {
      const next = new Map(prev)
      if (cantiereId) {
        next.set(ddtRef, cantiereId)
      } else {
        next.delete(ddtRef)
      }
      return next
    })
  }

  const toggleExpand = (ddtRef: string | null) => {
    setDdtExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(ddtRef)) next.delete(ddtRef)
      else next.add(ddtRef)
      return next
    })
  }

  // Calcoli DDT
  const ddtGruppiConDdt = ddtData?.gruppi_ddt.filter(g => g.ddt_riferimento !== null) || []
  const ddtGruppoSenzaDdt = ddtData?.gruppi_ddt.find(g => g.ddt_riferimento === null)
  const ddtTotaleAssegnato = ddtGruppiConDdt
    .filter(g => ddtAssegnazioni.has(g.ddt_riferimento))
    .reduce((acc, g) => acc + g.totale_netto, 0)
  const ddtDeltaNonCoperto = ddtData ? ddtData.imponibile_fattura - ddtTotaleAssegnato - (ddtGruppoSenzaDdt?.totale_netto || 0) : 0
  const ddtTuttiAssegnati = ddtGruppiConDdt.every(g => ddtAssegnazioni.has(g.ddt_riferimento))
  const ddtIsValid = ddtGruppiConDdt.length > 0 && ddtTuttiAssegnati

  // ─── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      if (mode === 'ddt' && ddtData?.fattura_fornitore_id) {
        // Modalita DDT: costruisci allocazioni nette per la server action
        const allocs: { ddt_riferimento: string | null; cantiere_id: string; importo_netto: number }[] = []

        for (const g of ddtGruppiConDdt) {
          const cantiereId = ddtAssegnazioni.get(g.ddt_riferimento)
          if (cantiereId) {
            allocs.push({
              ddt_riferimento: g.ddt_riferimento,
              cantiere_id: cantiereId,
              importo_netto: g.totale_netto
            })
          }
        }

        // Delta senza DDT → cantiere manuale se specificato
        if (ddtGruppoSenzaDdt && ddtManualeCantiere) {
          allocs.push({
            ddt_riferimento: null,
            cantiere_id: ddtManualeCantiere,
            importo_netto: ddtGruppoSenzaDdt.totale_netto
          })
        }

        // Delta non coperto da alcuna riga → cantiere manuale
        if (ddtDeltaNonCoperto > 0.01 && ddtManualeCantiere) {
          allocs.push({
            ddt_riferimento: null,
            cantiere_id: ddtManualeCantiere,
            importo_netto: Math.round(ddtDeltaNonCoperto * 100) / 100
          })
        }

        await salvaAssegnazioneDDT({
          scadenza_id: scadenzaId,
          fattura_fornitore_id: ddtData.fattura_fornitore_id,
          allocazioni: allocs
        })
      } else {
        // Modalita classica (singolo/multiplo)
        const data = mode === 'singolo'
          ? { mode: 'singolo' as const, cantiere_id: singleCantiere }
          : { mode: 'multiplo' as const, allocazioni }

        await Promise.all([
          salvaAssegnazioneCantiere(scadenzaId, data),
          aggiornaAliquotaIva(scadenzaId, aliquotaIva),
        ])
      }

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

  // ─── DDT Content ───────────────────────────────────────────────
  const ddtContent = ddtData && (
    <div className="space-y-2">
      {/* Stato: gia allocata da scadenza sorella */}
      {ddtData.gia_allocata && !ddtOverrideMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Lock size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold">Fattura gia allocata</p>
              <p className="mt-1">L'allocazione DDT e stata effettuata da un'altra rata di questa fattura ({ddtData.n_scadenze_sorelle} rate totali). L'importo e distribuito pro-quota.</p>
            </div>
          </div>
          {ddtData.allocazioni_esistenti.length > 0 && (
            <div className="space-y-1 mt-2">
              {ddtData.allocazioni_esistenti
                .filter((v, i, a) => a.findIndex(x => x.cantiere_id === v.cantiere_id && x.ddt_riferimento === v.ddt_riferimento) === i)
                .map((ae, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-amber-100">
                    <span className="text-zinc-600">
                      {ae.ddt_riferimento ? `DDT ${ae.ddt_riferimento}` : 'Senza DDT'}
                    </span>
                    <span className="font-mono font-semibold text-zinc-800">{ae.cantiere_nome}</span>
                  </div>
                ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDdtOverrideMode(true)}
            className="w-full text-xs border-amber-300 text-amber-700 hover:bg-amber-100 mt-1"
          >
            Modifica allocazione
          </Button>
        </div>
      )}

      {/* Gruppi DDT assegnabili */}
      {(!ddtData.gia_allocata || ddtOverrideMode) && (
        <>
          {ddtData.n_scadenze_sorelle > 1 && (
            <div className="text-[10px] text-zinc-500 bg-zinc-50 rounded px-2 py-1 border border-zinc-200">
              Fattura con {ddtData.n_scadenze_sorelle} rate. L'allocazione viene distribuita su tutte le scadenze.
            </div>
          )}

          {ddtGruppiConDdt.map(g => {
            const isExpanded = ddtExpandedGroups.has(g.ddt_riferimento)
            const selectedCantiere = ddtAssegnazioni.get(g.ddt_riferimento) || ''

            return (
              <div key={g.ddt_riferimento || 'null'} className="rounded-lg border border-zinc-200 overflow-hidden">
                {/* Header gruppo DDT */}
                <div className="bg-zinc-50 px-3 py-2 flex items-center gap-2">
                  <button type="button" onClick={() => toggleExpand(g.ddt_riferimento)} className="text-zinc-400 hover:text-zinc-600">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <Package size={13} className="text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-zinc-800">DDT {g.ddt_riferimento}</span>
                    <span className="text-[10px] text-zinc-500 ml-2">{g.righe.length} {g.righe.length === 1 ? 'riga' : 'righe'}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-700 flex-shrink-0">{formatEuro(g.totale_netto)}</span>
                </div>

                {/* Righe espanse */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-white px-3 py-1.5 space-y-0.5">
                    {g.righe.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] text-zinc-600 py-0.5">
                        <span className="truncate flex-1 mr-2" title={r.descrizione}>{r.descrizione || '-'}</span>
                        <span className="font-mono text-zinc-500 flex-shrink-0">{formatEuro(r.prezzo_totale)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selettore cantiere */}
                <div className="border-t border-zinc-100 px-3 py-2 bg-white">
                  <select
                    title={`Cantiere per DDT ${g.ddt_riferimento}`}
                    value={selectedCantiere}
                    onChange={(e) => handleDdtCantiereChange(g.ddt_riferimento, e.target.value)}
                    className={`w-full h-8 rounded-md border text-xs px-2 outline-none focus:ring-1 focus:ring-blue-400 ${
                      !selectedCantiere ? 'border-rose-300 bg-rose-50/50' : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <option value="">-- Assegna cantiere --</option>
                    {cantieri.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  {g.cantiere_suggerito && !selectedCantiere && (
                    <button
                      type="button"
                      onClick={() => handleDdtCantiereChange(g.ddt_riferimento, g.cantiere_suggerito!.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 mt-1"
                    >
                      Suggerito: {g.cantiere_suggerito.nome} ({g.cantiere_suggerito.codice})
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Righe senza DDT + delta */}
          {((ddtGruppoSenzaDdt && ddtGruppoSenzaDdt.totale_netto > 0) || ddtDeltaNonCoperto > 0.01) && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600">Importo senza DDT</span>
                <span className="font-mono text-xs font-bold text-zinc-700">
                  {formatEuro((ddtGruppoSenzaDdt?.totale_netto || 0) + Math.max(0, ddtDeltaNonCoperto))}
                </span>
              </div>
              <select
                title="Cantiere per righe senza DDT"
                value={ddtManualeCantiere}
                onChange={(e) => setDdtManualeCantiere(e.target.value)}
                className="w-full h-8 rounded-md border border-zinc-200 bg-white text-xs px-2 outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">-- Assegna manualmente --</option>
                {cantieri.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Riepilogo allocazione */}
          <div className={`p-2.5 rounded-lg border ${ddtIsValid ? 'bg-emerald-50 border-emerald-200' : 'bg-zinc-50 border-zinc-200'}`}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-600">Imponibile fattura:</span>
              <span className="font-mono font-bold">{formatEuro(ddtData.imponibile_fattura)}</span>
            </div>
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-zinc-600">Allocato (netto):</span>
              <span className="font-mono">{formatEuro(ddtTotaleAssegnato + (ddtManualeCantiere ? (ddtGruppoSenzaDdt?.totale_netto || 0) + Math.max(0, ddtDeltaNonCoperto) : 0))}</span>
            </div>
            {/* Barra progresso */}
            <div className="mt-2 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${ddtIsValid ? 'bg-emerald-500' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, ddtData.imponibile_fattura > 0 ? (ddtTotaleAssegnato / ddtData.imponibile_fattura) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )

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

      {/* IVA / Scorporo — nascosto in modalita DDT (l'imponibile viene dal XML) */}
      {mode !== 'ddt' && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/30 p-2.5 mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Aliquota IVA</div>
            <select
              title="Aliquota IVA"
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
          <div className="flex items-center justify-between rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1.5">
            <div className="text-xs font-semibold text-blue-800">Costo Cantiere</div>
            <span className="font-mono font-black text-blue-900 text-sm">{formatEuro(imponibile)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-purple-50 border border-purple-200 px-2.5 py-1.5">
            <div className="text-xs text-purple-700">
              <span className="font-semibold">Credito IVA</span>
              <span className="text-[10px] text-purple-500 ml-1">(Saldo IVA)</span>
            </div>
            <span className="font-mono font-bold text-purple-800 text-sm">{formatEuro(ivaGenerata)}</span>
          </div>
        </div>
      )}

      {/* Selettore modalita + form cantiere */}
      <div className="mt-3 flex-1 overflow-y-auto space-y-3 min-h-0">
        {/* Tabs modalita */}
        <div className="flex p-1 bg-zinc-100 rounded-lg">
          {ddtGruppiConDdt.length > 0 && (
            <button
              type="button"
              onClick={() => setMode('ddt')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === 'ddt' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              <Package size={13} /> Per DDT
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode('singolo')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mode === 'singolo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Cantiere Singolo
          </button>
          <button
            type="button"
            onClick={() => setMode('multiplo')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === 'multiplo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            <SplitSquareVertical size={13} /> Dividi
          </button>
        </div>

        {/* Loading DDT */}
        {ddtLoading && mode === 'ddt' && (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Caricamento righe fattura...</span>
          </div>
        )}

        {/* Errore DDT */}
        {ddtError && mode === 'ddt' && (
          <div className="text-xs text-rose-600 bg-rose-50 rounded p-2 border border-rose-200">
            {ddtError}
          </div>
        )}

        {/* Contenuto DDT */}
        {mode === 'ddt' && !ddtLoading && !ddtError && ddtContent}

        {/* Contenuto Singolo */}
        {mode === 'singolo' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Seleziona cantiere</label>
            <select
              title="Seleziona cantiere"
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

        {/* Contenuto Multiplo */}
        {mode === 'multiplo' && (
          <div className="space-y-3">
            <div className="space-y-2">
              {allocazioni.map((allocazione, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1">
                    <select
                      title={`Cantiere allocazione ${index + 1}`}
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
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">EUR</span>
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
          disabled={
            isSubmitting ||
            (mode === 'multiplo' && !isMultiValid) ||
            (mode === 'ddt' && !ddtIsValid) ||
            (mode === 'ddt' && ddtData?.gia_allocata === true && !ddtOverrideMode)
          }
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? 'Salvataggio...' : mode === 'ddt' ? 'Salva Allocazione DDT' : 'Salva Assegnazione'}
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
          /* LAYOUT SPLIT: PDF a sinistra + Form a destra */
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
          /* LAYOUT SINGOLO: solo form (no PDF) */
          <div className="p-6 flex flex-col max-h-[85vh]">
            <DialogHeader className="mb-4 flex-shrink-0">
              <DialogTitle className="text-xl">Assegnazione Cantiere</DialogTitle>
              <DialogDescription>
                Associa questa fattura a uno o più cantieri.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 flex flex-col">
              {formContent}
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
