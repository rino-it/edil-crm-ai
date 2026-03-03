'use client'
import { useState, Fragment, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ChevronDown, PackageOpen, CalendarDays, Loader2 } from "lucide-react"
import { CashflowWeek, CashflowDetailRow } from '@/utils/data-fetcher'
import { riprogrammaScadenza } from '@/app/scadenze/actions'
import { toast } from 'sonner'

interface CashflowTableProps {
  weeks: CashflowWeek[]
  daPianificare: CashflowWeek | null
}

// ─── Riga dettaglio con date picker inline ────────────────────────────────────
function DetailRow({ d, bgHover = 'hover:bg-white' }: { d: CashflowDetailRow; bgHover?: string }) {
  const [isPending, startTransition] = useTransition()

  const handleDateChange = (newDate: string) => {
    if (!newDate) return
    startTransition(async () => {
      try {
        await riprogrammaScadenza(d.id, newDate)
        toast.success(`${d.ragione_sociale} → spostata al ${new Date(newDate).toLocaleDateString('it-IT')}`)
      } catch {
        toast.error('Errore durante la riprogrammazione')
      }
    })
  }

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${bgHover} text-sm transition-opacity ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={`text-[10px] ${d.tipo === 'entrata' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {d.tipo === 'entrata' ? 'IN' : 'OUT'}
        </Badge>
        <span className="font-bold text-zinc-800">{d.ragione_sociale}</span>
        <span className="text-zinc-400 font-mono text-xs">{d.fattura_riferimento || '-'}</span>
      </div>
      <div className="flex items-center gap-3">
        {/* Date picker inline */}
        <label className="flex items-center gap-1 cursor-pointer group relative">
          {isPending
            ? <Loader2 size={13} className="text-zinc-400 animate-spin" />
            : <CalendarDays size={13} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
          }
          <span className="text-zinc-500 text-xs group-hover:text-blue-600 transition-colors">
            {new Date(d.data_effettiva).toLocaleDateString('it-IT')}
          </span>
          <input
            type="date"
            defaultValue={d.data_effettiva}
            onChange={e => handleDateChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
            title="Sposta nel cashflow"
          />
        </label>
        <span className={`font-mono font-bold ${d.tipo === 'entrata' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {formatEuro(d.importo_residuo)}
        </span>
      </div>
    </div>
  )
}

// ─── Componente principale ────────────────────────────────────────────────────
export function CashflowTable({ weeks, daPianificare }: CashflowTableProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [parkExpanded, setParkExpanded] = useState(false)

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="space-y-4">

    {/* ── Parcheggio: Da Pianificare ───────────────────────────────── */}
    {daPianificare && (daPianificare.entrate > 0 || daPianificare.uscite > 0) && (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 overflow-hidden">
        <button
          onClick={() => setParkExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <PackageOpen size={16} className="text-amber-500" />
            Da Pianificare
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 font-semibold ml-1">
              PARCHEGGIO
            </Badge>
            <span className="text-xs font-normal text-amber-600">
              {daPianificare.dettagli.length} fatture — non influenzano il saldo stimato
            </span>
          </span>
          <span className="flex items-center gap-4 font-mono text-xs">
            {daPianificare.entrate > 0 && <span className="text-emerald-700">+{formatEuro(daPianificare.entrate)}</span>}
            {daPianificare.uscite > 0 && <span className="text-rose-700">-{formatEuro(daPianificare.uscite)}</span>}
            {parkExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        </button>
        {parkExpanded && (
          <div className="px-6 py-3 space-y-1 border-t border-amber-200 bg-white/60">
            {daPianificare.dettagli.map((d, j) => (
              <DetailRow key={d.id || j} d={d} bgHover="hover:bg-amber-50" />
            ))}
          </div>
        )}
      </div>
    )}

    {/* ── Tabella settimane future ──────────────────────────────────── */}
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
          return (
            <Fragment key={i}>
              {/* Riga principale cliccabile */}
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

              {/* Sotto-tabella espandibile con date picker */}
              {isExpanded && (
                <TableRow key={`detail-${i}`}>
                  <TableCell colSpan={6} className="p-0 bg-zinc-50/80">
                    <div className="px-6 py-3 space-y-1">
                      {w.dettagli.map((d, j) => (
                        <DetailRow key={d.id || j} d={d} />
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
    </div>
  )
}
