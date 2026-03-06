'use client'

import { useState, useTransition, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangle, ArrowRightLeft, Landmark, PackageOpen, ChevronRight, ChevronDown,
  CalendarDays, Loader2, Building2
} from 'lucide-react'
import type { CashflowPerContoProjection, CashflowWeek, CashflowDetailRow } from '@/utils/data-fetcher'
import { assegnaContoAScadenza } from './actions'
import { riprogrammaScadenza } from '@/app/scadenze/actions'
import { toast } from 'sonner'

interface Props {
  perContoData: CashflowPerContoProjection
  contiLista: { id: string; label: string }[]
}

const formatEuro = (val: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

// ─── Riga dettaglio con assegnazione conto ─────────────────────────────
function DetailRowConConto({
  d,
  contiLista,
  contoSelezionato,
}: {
  d: CashflowDetailRow
  contiLista: { id: string; label: string }[]
  contoSelezionato?: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [dateValue, setDateValue] = useState(d.data_effettiva.split('T')[0])
  const [assigningConto, setAssigningConto] = useState(false)

  const commitDate = (newDate: string) => {
    setEditing(false)
    if (!newDate || newDate === d.data_effettiva.split('T')[0]) return
    setDateValue(newDate)
    startTransition(async () => {
      try {
        await riprogrammaScadenza(d.id, newDate)
        toast.success(`Spostata al ${new Date(newDate + 'T12:00:00').toLocaleDateString('it-IT')}`)
      } catch {
        setDateValue(d.data_effettiva.split('T')[0])
        toast.error('Errore riprogrammazione')
      }
    })
  }

  const commitConto = (contoId: string) => {
    setAssigningConto(false)
    startTransition(async () => {
      try {
        await assegnaContoAScadenza(d.id, contoId || null)
        toast.success('Conto assegnato!')
      } catch {
        toast.error('Errore assegnazione conto')
      }
    })
  }

  return (
    <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-white text-sm transition-opacity ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Badge variant="outline" className={`text-[10px] shrink-0 ${d.tipo === 'entrata' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {d.tipo === 'entrata' ? 'IN' : 'OUT'}
        </Badge>
        <span className="font-bold text-zinc-800 truncate">{d.ragione_sociale}</span>
        <span className="text-zinc-400 font-mono text-xs hidden md:inline">{d.fattura_riferimento || '-'}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {/* Assegnazione conto */}
        {assigningConto ? (
          <select
            autoFocus
            defaultValue={contoSelezionato || ''}
            onBlur={e => commitConto(e.target.value)}
            onChange={e => commitConto(e.target.value)}
            className="text-xs border border-blue-300 rounded px-1.5 py-0.5 bg-blue-50 text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[160px]"
          >
            <option value="">— Nessun conto —</option>
            {contiLista.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setAssigningConto(true)}
            title="Assegna conto bancario"
            className="text-zinc-400 hover:text-blue-500 transition-colors"
          >
            <Building2 size={13} />
          </button>
        )}

        {/* Click-to-edit date */}
        {editing ? (
          <input
            type="date"
            value={dateValue}
            autoFocus
            onChange={e => setDateValue(e.target.value)}
            onBlur={e => commitDate(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDate(dateValue)
              if (e.key === 'Escape') { setEditing(false); setDateValue(d.data_effettiva.split('T')[0]) }
            }}
            className="text-xs border border-blue-300 rounded px-1.5 py-0.5 bg-blue-50 text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Riprogramma"
            className="flex items-center gap-1 group"
          >
            {isPending
              ? <Loader2 size={13} className="text-zinc-400 animate-spin" />
              : <CalendarDays size={13} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
            }
            <span className="text-zinc-500 text-xs group-hover:text-blue-600 group-hover:underline transition-colors">
              {new Date(dateValue + 'T12:00:00').toLocaleDateString('it-IT')}
            </span>
          </button>
        )}
        <span className={`font-mono font-bold ${d.tipo === 'entrata' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {formatEuro(d.importo_residuo)}
        </span>
      </div>
    </div>
  )
}

// ─── Tabella settimanale per conto ────────────────────────────────────────
function ContoWeekTable({ weeks, contiLista }: { weeks: CashflowWeek[]; contiLista: { id: string; label: string }[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  // Filtra solo settimane con movimenti
  const activeWeeks = weeks.filter(w => w.entrate > 0 || w.uscite > 0)

  if (activeWeeks.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-4">
        Nessuna scadenza assegnata a questo conto nelle prossime settimane.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader className="bg-zinc-50">
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead className="text-right">Entrate</TableHead>
          <TableHead className="text-right">Uscite</TableHead>
          <TableHead className="text-right">Saldo Netto</TableHead>
          <TableHead className="text-right font-bold">Liquidità</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weeks.map((w, i) => {
          const netto = w.entrate - w.uscite
          const isExpanded = expandedIdx === i
          const hasDetails = w.dettagli.length > 0
          const isEmpty = w.entrate === 0 && w.uscite === 0
          if (isEmpty) return null
          return (
            <Fragment key={i}>
              <TableRow
                onClick={() => hasDetails && setExpandedIdx(isExpanded ? null : i)}
                className={`${hasDetails ? 'cursor-pointer' : ''} hover:bg-zinc-50/50`}
              >
                <TableCell className="w-8 pr-0">
                  {hasDetails && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {w.weekLabel}
                  {hasDetails && <span className="ml-2 text-xs text-zinc-400">({w.dettagli.length})</span>}
                </TableCell>
                <TableCell className="text-right text-emerald-600 font-mono">{formatEuro(w.entrate)}</TableCell>
                <TableCell className="text-right text-rose-600 font-mono">{formatEuro(w.uscite)}</TableCell>
                <TableCell className={`text-right font-mono font-bold ${netto > 0 ? 'text-emerald-600' : netto < 0 ? 'text-rose-600' : 'text-zinc-400'}`}>
                  {netto > 0 ? '+' : ''}{formatEuro(netto)}
                </TableCell>
                <TableCell className={`text-right font-mono font-black text-lg ${w.saldoPrevisto < 0 ? 'text-red-600 bg-red-50' : 'text-blue-900'}`}>
                  {formatEuro(w.saldoPrevisto)}
                </TableCell>
              </TableRow>

              {isExpanded && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0 bg-zinc-50/80">
                    <div className="px-6 py-3 space-y-1">
                      {w.dettagli.map((d, j) => (
                        <DetailRowConConto key={d.id || j} d={d} contiLista={contiLista} />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

// ─── Componente principale ────────────────────────────────────────────────
export function CashflowPerContoSection({ perContoData, contiLista }: Props) {
  const [selectedContoId, setSelectedContoId] = useState<string | null>(null)
  const [showNonAssegnate, setShowNonAssegnate] = useState(false)

  const { conti, nonAssegnate, suggerimentiGiroconto } = perContoData

  const totalNonAssegnate = nonAssegnate.reduce((acc, w) => acc + w.dettagli.length, 0)
  const selectedConto = conti.find(c => c.contoId === selectedContoId)

  return (
    <div className="space-y-6">
      {/* Header sezione */}
      <div className="flex items-center gap-2">
        <Landmark className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">Cashflow Per Conto</h2>
        <span className="text-sm text-zinc-400">Proiezione liquidità per singolo conto bancario</span>
      </div>

      {/* Alert Suggerimenti Giroconto */}
      {suggerimentiGiroconto.length > 0 && (
        <div className="space-y-2">
          {suggerimentiGiroconto.map((s, i) => (
            <Alert key={i} className="bg-amber-50 border-amber-200 text-amber-900 shadow-sm">
              <ArrowRightLeft className="h-5 w-5 text-amber-600" />
              <AlertTitle className="font-bold">Suggerimento Giroconto</AlertTitle>
              <AlertDescription className="mt-1">
                <span className="font-bold text-amber-800">{s.contoDestinazioneNome}</span>: {s.motivazione}.
                <br />
                Trasferisci <span className="font-black">{formatEuro(s.importo)}</span> da <span className="font-bold">{s.contoOrigineNome}</span> entro la settimana &quot;{s.settimana}&quot;.
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Card per singolo conto */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {conti.map(conto => {
          const isSelected = selectedContoId === conto.contoId
          return (
            <button
              key={conto.contoId}
              onClick={() => {
                setSelectedContoId(isSelected ? null : conto.contoId)
                setShowNonAssegnate(false)
              }}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : conto.hasNegativeWeeks
                    ? 'border-red-200 bg-red-50/50 hover:border-red-400'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-[10px] font-bold uppercase text-zinc-500 truncate">{conto.nomeBanca}</p>
              <p className="text-xs text-zinc-400 truncate">{conto.nomeConto}</p>
              <p className={`text-lg font-black mt-1 ${conto.saldoAttuale < 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                {formatEuro(conto.saldoAttuale)}
              </p>
              <div className="mt-1">
                {conto.hasNegativeWeeks ? (
                  <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-200">
                    <AlertTriangle size={10} className="mr-1" /> Rischio
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                    OK
                  </Badge>
                )}
              </div>
            </button>
          )
        })}

        {/* Card Non Assegnate */}
        {totalNonAssegnate > 0 && (
          <button
            onClick={() => {
              setShowNonAssegnate(!showNonAssegnate)
              setSelectedContoId(null)
            }}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
              showNonAssegnate
                ? 'border-amber-500 bg-amber-50 shadow-md'
                : 'border-amber-200 bg-amber-50/50 hover:border-amber-400'
            }`}
          >
            <p className="text-[10px] font-bold uppercase text-amber-600">Non Assegnate</p>
            <p className="text-2xl font-black text-amber-800 mt-1">{totalNonAssegnate}</p>
            <p className="text-xs text-amber-600">scadenze</p>
            <div className="mt-1">
              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                <PackageOpen size={10} className="mr-1" /> Da assegnare
              </Badge>
            </div>
          </button>
        )}
      </div>

      {/* Tabella dettaglio per conto selezionato */}
      {selectedConto && (
        <Card className="shadow-sm border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark size={16} className="text-blue-500" />
              {selectedConto.nomeBanca} — {selectedConto.nomeConto}
              <Badge variant="outline" className="text-[10px] ml-2">
                Saldo: {formatEuro(selectedConto.saldoAttuale)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContoWeekTable weeks={selectedConto.weeks} contiLista={contiLista} />
          </CardContent>
        </Card>
      )}

      {/* Tabella scadenze non assegnate */}
      {showNonAssegnate && nonAssegnate.length > 0 && (
        <Card className="shadow-sm border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PackageOpen size={16} className="text-amber-500" />
              Scadenze Non Assegnate
              <span className="text-xs font-normal text-zinc-400 ml-2">
                Assegna un conto per includerle nella proiezione per-conto
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {nonAssegnate.flatMap(w => w.dettagli).map((d, j) => (
                <DetailRowConConto key={d.id || j} d={d} contiLista={contiLista} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
