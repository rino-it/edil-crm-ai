'use client'
import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ChevronDown } from "lucide-react"
import { CashflowWeek } from '@/utils/data-fetcher'

export function CashflowTable({ weeks }: { weeks: CashflowWeek[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

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
          return (
            <>
              {/* Riga principale cliccabile */}
              <TableRow
                key={i}
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

              {/* Sotto-tabella espandibile */}
              {isExpanded && (
                <TableRow key={`detail-${i}`}>
                  <TableCell colSpan={6} className="p-0 bg-zinc-50/80">
                    <div className="px-6 py-3 space-y-1">
                      {w.dettagli.map((d, j) => (
                        <div key={j} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-white text-sm">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className={`text-[10px] ${d.tipo === 'entrata' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                              {d.tipo === 'entrata' ? 'IN' : 'OUT'}
                            </Badge>
                            <span className="font-bold text-zinc-800">{d.ragione_sociale}</span>
                            <span className="text-zinc-400 font-mono text-xs">{d.fattura_riferimento || '-'}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-zinc-500 text-xs">{new Date(d.data_effettiva).toLocaleDateString('it-IT')}</span>
                            <span className={`font-mono font-bold ${d.tipo === 'entrata' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatEuro(d.importo_residuo)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          )
        })}
      </TableBody>
    </Table>
  )
}
