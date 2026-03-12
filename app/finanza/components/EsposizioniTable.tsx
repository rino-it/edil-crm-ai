'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, MapPin, FileText } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EsposizioneSoggetto } from '@/utils/data-fetcher'
import { getFattureAperteSoggetto, FatturaApertaSoggetto } from '../actions'

const formatEuro = (val: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

const INITIAL_LIMIT = 10

export function EsposizioniTable({ data }: { data: EsposizioneSoggetto[] }) {
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
                          : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                      }
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
                      {e.entrate_residuo > 0 ? formatEuro(e.entrate_residuo) : <span className="text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-700">
                      {e.uscite_residuo > 0 ? formatEuro(e.uscite_residuo) : <span className="text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${e.netto >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatEuro(e.netto)}
                    </TableCell>
                    <TableCell className="text-right text-zinc-500 text-sm">{e.n_fatture}</TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow key={`${e.soggetto_id}-detail`}>
                      <TableCell colSpan={7} className="p-0">
                        <div className="bg-zinc-50/80 border-y border-zinc-200 px-6 py-3">
                          {isLoading ? (
                            <div className="flex items-center gap-2 text-zinc-400 py-4 justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Caricamento fatture...</span>
                            </div>
                          ) : soggettoFatture.length === 0 ? (
                            <p className="text-sm text-zinc-500 italic py-2">Nessuna fattura aperta trovata.</p>
                          ) : (
                            <div className="space-y-1">
                              <div className="grid grid-cols-[1fr_100px_100px_100px_80px_120px] gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wide pb-1 border-b border-zinc-200">
                                <span>Fattura / Descrizione</span>
                                <span className="text-right">Importo</span>
                                <span className="text-right">Pagato</span>
                                <span className="text-right">Residuo</span>
                                <span className="text-center">Stato</span>
                                <span>Cantiere</span>
                              </div>
                              {soggettoFatture.map(f => (
                                <div
                                  key={f.id}
                                  className="grid grid-cols-[1fr_100px_100px_100px_80px_120px] gap-2 items-center py-1.5 border-b border-zinc-100 last:border-0 text-xs"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <FileText className="h-3 w-3 text-zinc-400 shrink-0" />
                                    <span className="font-medium text-zinc-800 truncate">
                                      {f.fattura_riferimento || f.descrizione || '—'}
                                    </span>
                                    {f.data_scadenza && (
                                      <span className="text-[10px] text-zinc-400 shrink-0">
                                        scad. {new Date(f.data_scadenza).toLocaleDateString('it-IT')}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-right font-mono text-zinc-600">{formatEuro(f.importo_totale)}</span>
                                  <span className="text-right font-mono text-zinc-400">
                                    {f.importo_pagato > 0 ? formatEuro(f.importo_pagato) : '—'}
                                  </span>
                                  <span className="text-right font-mono font-bold text-rose-700">{formatEuro(f.residuo)}</span>
                                  <span className="text-center">
                                    <Badge variant="outline" className={`text-[9px] px-1.5 ${
                                      f.stato === 'scaduto' ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : f.stato === 'parziale' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                      {f.stato === 'scaduto' ? 'SCADUTO' : f.stato === 'parziale' ? 'PARZIALE' : 'APERTA'}
                                    </Badge>
                                  </span>
                                  <div className="flex items-center gap-1 min-w-0">
                                    {f.cantiere_nome ? (
                                      <>
                                        <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                                        <span className="text-[10px] text-zinc-600 truncate">{f.cantiere_nome}</span>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-zinc-400 italic">Da smistare</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-between items-center pt-2 border-t border-zinc-300">
                                <span className="text-xs font-bold text-zinc-600">
                                  {soggettoFatture.length} fattur{soggettoFatture.length === 1 ? 'a' : 'e'} apert{soggettoFatture.length === 1 ? 'a' : 'e'}
                                </span>
                                <span className="text-xs font-mono font-black text-rose-700">
                                  Totale residuo: {formatEuro(soggettoFatture.reduce((s, f) => s + f.residuo, 0))}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
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
            {showAll
              ? `Mostra solo i primi ${INITIAL_LIMIT}`
              : `Mostra tutti (${data.length} soggetti)`
            }
          </Button>
        </div>
      )}
    </div>
  )
}
