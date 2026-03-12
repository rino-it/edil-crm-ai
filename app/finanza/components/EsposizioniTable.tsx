'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, MapPin, FileText, Check, Calendar, CreditCard } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EsposizioneSoggetto } from '@/utils/data-fetcher'
import {
  getFattureAperteSoggetto,
  FatturaApertaSoggetto,
  saldaFatturaEsposizione,
  riprogrammaScadenzaEsposizione,
  assegnaCantiereEsposizione,
} from '../actions'
import { toast } from 'sonner'

const formatEuro = (val: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

const INITIAL_LIMIT = 10

interface Props {
  data: EsposizioneSoggetto[]
  cantieri: { id: string; label: string }[]
  contiBanca: { id: string; label: string }[]
}

export function EsposizioniTable({ data, cantieri, contiBanca }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fatture, setFatture] = useState<Record<string, FatturaApertaSoggetto[]>>({})
  const [loading, setLoading] = useState<string | null>(null)

  const visible = showAll ? data : data.slice(0, INITIAL_LIMIT)
  const hasMore = data.length > INITIAL_LIMIT

  async function toggleExpand(soggettoId: string) {
    if (expandedId === soggettoId) {
      setExpandedId(null)
      return
    }
    setExpandedId(soggettoId)
    if (!fatture[soggettoId]) {
      setLoading(soggettoId)
      const result = await getFattureAperteSoggetto(soggettoId)
      setFatture(prev => ({ ...prev, [soggettoId]: result }))
      setLoading(null)
    }
  }

  function refreshFatture(soggettoId: string) {
    getFattureAperteSoggetto(soggettoId).then(result => {
      setFatture(prev => ({ ...prev, [soggettoId]: result }))
    })
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-zinc-50/80">
            <TableRow>
              <TableHead className="font-semibold w-[30px]" />
              <TableHead className="font-semibold">Soggetto</TableHead>
              <TableHead className="font-semibold w-[70px]">Tipo</TableHead>
              <TableHead className="text-right font-semibold w-[120px]">Crediti</TableHead>
              <TableHead className="text-right font-semibold w-[120px]">Debiti</TableHead>
              <TableHead className="text-right font-semibold w-[120px]">Netto</TableHead>
              <TableHead className="text-right font-semibold w-[60px]">Fatt.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((e, i) => {
              const isExpanded = expandedId === e.soggetto_id
              const isLoading = loading === e.soggetto_id
              const soggettoFatture = fatture[e.soggetto_id] || []

              return (
                <>
                  <TableRow
                    key={e.soggetto_id}
                    className={`cursor-pointer transition-colors ${i < 3 ? 'bg-amber-50/30' : ''} ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-zinc-50'}`}
                    onClick={() => toggleExpand(e.soggetto_id)}
                  >
                    <TableCell className="w-[30px] px-2">
                      {isLoading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                        : isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
                          : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                    </TableCell>
                    <TableCell className="font-medium text-zinc-900">
                      <div className="flex items-center gap-2">
                        {i < 3 && <span className="text-[10px] font-black text-amber-600 bg-amber-100 rounded-full w-5 h-5 flex items-center justify-center">{i + 1}</span>}
                        <span className="truncate max-w-[200px]">{e.ragione_sociale}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${e.tipo_soggetto === 'cliente' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : e.tipo_soggetto === 'fornitore' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-zinc-50 text-zinc-600'}`}>
                        {e.tipo_soggetto || 'N/D'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">
                      {e.entrate_residuo > 0 ? formatEuro(e.entrate_residuo) : <span className="text-zinc-300">&mdash;</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-700">
                      {e.uscite_residuo > 0 ? formatEuro(e.uscite_residuo) : <span className="text-zinc-300">&mdash;</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${e.netto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatEuro(e.netto)}
                    </TableCell>
                    <TableCell className="text-right text-zinc-500 text-sm">{e.n_fatture}</TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow key={`${e.soggetto_id}-detail`}>
                      <TableCell colSpan={7} className="p-0">
                        <DetailPanel
                          soggettoId={e.soggetto_id}
                          fatture={soggettoFatture}
                          isLoading={isLoading}
                          cantieri={cantieri}
                          contiBanca={contiBanca}
                          onRefresh={() => refreshFatture(e.soggetto_id)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
            onClick={() => setShowAll(prev => !prev)}
          >
            {showAll ? `Mostra solo i primi ${INITIAL_LIMIT}` : `Mostra tutti (${data.length} soggetti)`}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Panel dettaglio fatture per soggetto ───────────────────────

function DetailPanel({
  soggettoId,
  fatture,
  isLoading,
  cantieri,
  contiBanca,
  onRefresh,
}: {
  soggettoId: string
  fatture: FatturaApertaSoggetto[]
  isLoading: boolean
  cantieri: { id: string; label: string }[]
  contiBanca: { id: string; label: string }[]
  onRefresh: () => void
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [saldoForm, setSaldoForm] = useState<{ id: string; contoId: string; data: string } | null>(null)
  const [schedForm, setSchedForm] = useState<{ id: string; data: string } | null>(null)

  async function handleSalda() {
    if (!saldoForm) return
    setPendingAction(saldoForm.id + '-salda')
    try {
      await saldaFatturaEsposizione(saldoForm.id, saldoForm.contoId, saldoForm.data)
      toast.success('Fattura saldata')
      setSaldoForm(null)
      onRefresh()
    } catch {
      toast.error('Errore durante il saldo')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRiprogramma() {
    if (!schedForm) return
    setPendingAction(schedForm.id + '-sched')
    try {
      await riprogrammaScadenzaEsposizione(schedForm.id, schedForm.data)
      toast.success('Scadenza riprogrammata')
      setSchedForm(null)
      onRefresh()
    } catch {
      toast.error('Errore riprogrammazione')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCantiere(scadenzaId: string, cantiereId: string) {
    setPendingAction(scadenzaId + '-cantiere')
    try {
      await assegnaCantiereEsposizione(scadenzaId, cantiereId)
      toast.success('Cantiere assegnato')
      onRefresh()
    } catch {
      toast.error('Errore assegnazione')
    } finally {
      setPendingAction(null)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-zinc-50/80 border-y border-zinc-200 px-6 py-4 flex items-center gap-2 text-zinc-400 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Caricamento fatture...</span>
      </div>
    )
  }

  if (fatture.length === 0) {
    return (
      <div className="bg-zinc-50/80 border-y border-zinc-200 px-6 py-3">
        <p className="text-sm text-zinc-500 italic py-2">Nessuna fattura aperta trovata.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-50/80 border-y border-zinc-200 px-4 py-3">
      <div className="space-y-0.5">
        {/* Header */}
        <div className="grid grid-cols-[1fr_90px_90px_80px_140px_140px] gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wide pb-1.5 border-b border-zinc-200">
          <span>Fattura / Descrizione</span>
          <span className="text-right">Importo</span>
          <span className="text-right">Residuo</span>
          <span className="text-center">Pagato</span>
          <span className="text-center">Stato</span>
          <span>Cantiere</span>
        </div>

        {/* Rows */}
        {fatture.map(f => {
          const isSaldoOpen = saldoForm?.id === f.id
          const isSchedOpen = schedForm?.id === f.id
          const isPending = pendingAction?.startsWith(f.id)

          return (
            <div key={f.id}>
              <div className="grid grid-cols-[1fr_90px_90px_80px_140px_140px] gap-2 items-center py-2 border-b border-zinc-100 last:border-0 text-xs">
                {/* Fattura */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span className="font-medium text-zinc-800 truncate">
                    {f.fattura_riferimento || f.descrizione || '\u2014'}
                  </span>
                  {f.data_scadenza && (
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      scad. {new Date(f.data_scadenza).toLocaleDateString('it-IT')}
                    </span>
                  )}
                </div>

                {/* Importo */}
                <span className="text-right font-mono text-zinc-600">{formatEuro(f.importo_totale)}</span>

                {/* Residuo */}
                <span className="text-right font-mono font-bold text-rose-700">{formatEuro(f.residuo)}</span>

                {/* Pagato - click per saldare */}
                <div className="flex justify-center">
                  {isPending && pendingAction?.endsWith('-salda') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSaldoForm(isSaldoOpen ? null : {
                          id: f.id,
                          contoId: contiBanca[0]?.id || '',
                          data: new Date().toISOString().slice(0, 10),
                        })
                        setSchedForm(null)
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        isSaldoOpen
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : 'bg-white border border-zinc-200 text-zinc-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                      title="Salda fattura"
                    >
                      <CreditCard className="h-3 w-3" />
                      Salda
                    </button>
                  )}
                </div>

                {/* Stato - click per rischedulare */}
                <div className="flex justify-center">
                  {isPending && pendingAction?.endsWith('-sched') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSchedForm(isSchedOpen ? null : {
                          id: f.id,
                          data: f.data_scadenza || new Date().toISOString().slice(0, 10),
                        })
                        setSaldoForm(null)
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        f.stato === 'scaduto'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          : isSchedOpen
                            ? 'bg-blue-100 text-blue-700 border border-blue-300'
                            : 'bg-white border border-zinc-200 text-zinc-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                      title="Riprogramma scadenza"
                    >
                      <Calendar className="h-3 w-3" />
                      {f.stato === 'scaduto' ? 'SCADUTO' : f.stato === 'parziale' ? 'PARZIALE' : 'APERTA'}
                    </button>
                  )}
                </div>

                {/* Cantiere - select inline */}
                <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                  {isPending && pendingAction?.endsWith('-cantiere') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  ) : (
                    <select
                      title="Assegna cantiere"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleCantiere(f.id, e.target.value)
                      }}
                      className={`w-full h-7 rounded border text-[11px] px-1.5 outline-none focus:ring-1 focus:ring-blue-400 ${
                        f.cantiere_nome
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-zinc-200 bg-white text-zinc-500'
                      }`}
                    >
                      <option value="">
                        {f.cantiere_nome ? `${f.cantiere_nome}` : '-- Cantiere --'}
                      </option>
                      {cantieri.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Form saldo inline */}
              {isSaldoOpen && (
                <div className="flex items-center gap-2 py-2 px-3 bg-emerald-50/50 border border-emerald-200 rounded-lg my-1">
                  <select
                    title="Conto banca"
                    value={saldoForm.contoId}
                    onChange={(e) => setSaldoForm({ ...saldoForm, contoId: e.target.value })}
                    className="h-7 rounded border border-emerald-200 bg-white text-xs px-2 outline-none focus:ring-1 focus:ring-emerald-400 flex-1"
                  >
                    <option value="">-- Seleziona conto --</option>
                    {contiBanca.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    value={saldoForm.data}
                    onChange={(e) => setSaldoForm({ ...saldoForm, data: e.target.value })}
                    className="h-7 w-[140px] text-xs border-emerald-200"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    onClick={handleSalda}
                    disabled={!saldoForm.contoId || !!pendingAction}
                  >
                    {pendingAction === f.id + '-salda' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Conferma Saldo
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-500" onClick={() => setSaldoForm(null)}>
                    Annulla
                  </Button>
                </div>
              )}

              {/* Form rischedula inline */}
              {isSchedOpen && (
                <div className="flex items-center gap-2 py-2 px-3 bg-blue-50/50 border border-blue-200 rounded-lg my-1">
                  <span className="text-xs text-blue-700 font-medium">Nuova scadenza:</span>
                  <Input
                    type="date"
                    value={schedForm.data}
                    onChange={(e) => setSchedForm({ ...schedForm, data: e.target.value })}
                    className="h-7 w-[160px] text-xs border-blue-200"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    onClick={handleRiprogramma}
                    disabled={!!pendingAction}
                  >
                    {pendingAction === f.id + '-sched' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calendar className="h-3 w-3 mr-1" />}
                    Riprogramma
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-500" onClick={() => setSchedForm(null)}>
                    Annulla
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {/* Footer totale */}
        <div className="flex justify-between items-center pt-2 border-t border-zinc-300">
          <span className="text-xs font-bold text-zinc-600">
            {fatture.length} fattur{fatture.length === 1 ? 'a' : 'e'} apert{fatture.length === 1 ? 'a' : 'e'}
          </span>
          <span className="text-xs font-mono font-black text-rose-700">
            Totale residuo: {formatEuro(fatture.reduce((s, f) => s + f.residuo, 0))}
          </span>
        </div>
      </div>
    </div>
  )
}
