'use client'

import { useState } from 'react'
import { Landmark, ChevronDown, ChevronUp, CalendarDays, TrendingDown, CheckCircle2, Clock, AlertTriangle, Pause } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { MutuoConRate, RataMutuo } from '@/types/finanza'

const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
const formatData = (data: string) => new Date(data).toLocaleDateString('it-IT')

const statoBadge: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  attivo: { label: 'Attivo', className: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Clock size={12} /> },
  estinto: { label: 'Estinto', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 size={12} /> },
  sospeso: { label: 'Sospeso', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Pause size={12} /> },
}

export function MutuiSection({ mutui, ratePerMutuo }: { mutui: MutuoConRate[]; ratePerMutuo: Record<string, RataMutuo[]> }) {
  const [espanso, setEspanso] = useState<string | null>(null)
  const [showResiduoDettaglio, setShowResiduoDettaglio] = useState(false)

  if (mutui.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        <Landmark className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nessun mutuo registrato</p>
        <p className="text-xs">Clicca &quot;Nuovo Mutuo&quot; per aggiungerne uno</p>
      </div>
    )
  }

  const getRateResidue = (mutuoId: string) => (ratePerMutuo[mutuoId] || []).filter(r => r.stato !== 'pagato')
  const getDebitoResiduoMutuo = (mutuoId: string) => getRateResidue(mutuoId).reduce((acc, r) => acc + Number(r.importo_rata || 0), 0)
  const getCapitaleResiduoMutuo = (mutuoId: string) => getRateResidue(mutuoId).reduce((acc, r) => acc + Number(r.importo_capitale || 0), 0)
  const getInteressiResiduiMutuo = (mutuoId: string) => getRateResidue(mutuoId).reduce((acc, r) => acc + Number(r.importo_interessi || 0), 0)

  // KPI aggregati
  const mutuiAttivi = mutui.filter(m => m.stato === 'attivo')
  const capitaleResiduo = mutuiAttivi.reduce((acc, m) => acc + getDebitoResiduoMutuo(m.id), 0)
  const rateScadute = Object.values(ratePerMutuo).flat().filter(r => r.stato === 'da_pagare' && new Date(r.data_scadenza) < new Date()).length
  const totaleCapitaleResiduo = mutuiAttivi.reduce((acc, m) => acc + getCapitaleResiduoMutuo(m.id), 0)
  const totaleInteressiResidui = mutuiAttivi.reduce((acc, m) => acc + getInteressiResiduiMutuo(m.id), 0)
  const haBreakdownCapitaleInteressi = totaleCapitaleResiduo > 0 || totaleInteressiResidui > 0

  return (
    <div className="space-y-4">
      {/* KPI Mutui */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-[10px] font-bold text-blue-600 uppercase">Mutui Attivi</p>
          <p className="text-2xl font-black text-blue-800">{mutuiAttivi.length}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowResiduoDettaglio(prev => !prev)}
          className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 text-left transition-colors hover:bg-zinc-100/80"
        >
          <p className="text-[10px] font-bold text-zinc-500 uppercase">Debito Residuo</p>
          <p className="text-lg font-black text-zinc-800">{formatEuro(capitaleResiduo)}</p>
          <p className="text-[10px] text-zinc-500 mt-1">Clicca per vedere il dettaglio</p>
        </button>
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Mutui Estinti</p>
          <p className="text-2xl font-black text-emerald-800">{mutui.filter(m => m.stato === 'estinto').length}</p>
        </div>
        {rateScadute > 0 && (
          <div className="bg-red-50 rounded-lg p-3 border border-red-100">
            <p className="text-[10px] font-bold text-red-600 uppercase">Rate Scadute</p>
            <p className="text-2xl font-black text-red-800">{rateScadute}</p>
          </div>
        )}
      </div>

      {showResiduoDettaglio && (
        <Card className="shadow-sm border-zinc-200 bg-zinc-50/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Composizione debito residuo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <p className="text-[10px] font-bold uppercase text-zinc-500">Totale da estinguere</p>
                <p className="text-lg font-black text-zinc-900">{formatEuro(capitaleResiduo)}</p>
              </div>
              {haBreakdownCapitaleInteressi && (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-blue-600">Quota capitale residua</p>
                    <p className="text-lg font-black text-blue-900">{formatEuro(totaleCapitaleResiduo)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-amber-600">Interessi residui</p>
                    <p className="text-lg font-black text-amber-900">{formatEuro(totaleInteressiResidui)}</p>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-md border bg-white overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 text-zinc-500 border-b">
                  <tr>
                    <th className="p-2 font-medium">Mutuo</th>
                    <th className="p-2 font-medium">Pratica</th>
                    <th className="p-2 font-medium text-right">Da estinguere</th>
                    {haBreakdownCapitaleInteressi && <th className="p-2 font-medium text-right">Capitale</th>}
                    {haBreakdownCapitaleInteressi && <th className="p-2 font-medium text-right">Interessi</th>}
                    <th className="p-2 font-medium text-right">Rate residue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mutuiAttivi.map(mutuo => {
                    const debitoResiduoMutuo = getDebitoResiduoMutuo(mutuo.id)
                    const capitaleResiduoMutuo = getCapitaleResiduoMutuo(mutuo.id)
                    const interessiResiduiMutuo = getInteressiResiduiMutuo(mutuo.id)

                    return (
                      <tr key={`debito-${mutuo.id}`} className="hover:bg-zinc-50 transition-colors">
                        <td className="p-2">
                          <div className="font-medium text-zinc-900">{mutuo.banca_erogante}</div>
                          {mutuo.scopo && <div className="text-zinc-500">{mutuo.scopo}</div>}
                        </td>
                        <td className="p-2 text-zinc-600">{mutuo.numero_pratica || '—'}</td>
                        <td className="p-2 text-right font-bold text-zinc-900">{formatEuro(debitoResiduoMutuo)}</td>
                        {haBreakdownCapitaleInteressi && <td className="p-2 text-right text-blue-700">{formatEuro(capitaleResiduoMutuo)}</td>}
                        {haBreakdownCapitaleInteressi && <td className="p-2 text-right text-amber-700">{formatEuro(interessiResiduiMutuo)}</td>}
                        <td className="p-2 text-right text-zinc-600">{mutuo.rate_rimanenti}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista Mutui */}
      <div className="space-y-3">
        {mutui.map(mutuo => {
          const isEspanso = espanso === mutuo.id
          const rate = ratePerMutuo[mutuo.id] || []
          const badge = statoBadge[mutuo.stato]
          const progressPercent = mutuo.numero_rate > 0 ? Math.round((mutuo.rate_pagate / mutuo.numero_rate) * 100) : 0
          const debitoResiduoMutuo = getDebitoResiduoMutuo(mutuo.id)
          const capitaleResiduoMutuo = getCapitaleResiduoMutuo(mutuo.id)
          const interessiResiduiMutuo = getInteressiResiduiMutuo(mutuo.id)
          const haBreakdownMutuo = capitaleResiduoMutuo > 0 || interessiResiduiMutuo > 0

          return (
            <Card key={mutuo.id} className="shadow-sm border-border/60">
              {/* Header cliccabile */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50/50 transition-colors"
                onClick={() => setEspanso(isEspanso ? null : mutuo.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Landmark className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="font-bold text-foreground truncate">{mutuo.banca_erogante}</span>
                    {mutuo.scopo && <span className="text-xs text-muted-foreground truncate">- {mutuo.scopo}</span>}
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${badge.className}`}>
                      {badge.icon} <span className="ml-1">{badge.label}</span>
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatEuro(mutuo.capitale_erogato)} capitale</span>
                    <span>{mutuo.rate_pagate}/{mutuo.numero_rate} rate</span>
                    {mutuo.prossima_scadenza && (
                      <span className="flex items-center gap-1">
                        <CalendarDays size={10} /> Prossima: {formatData(mutuo.prossima_scadenza)}
                      </span>
                    )}
                    {mutuo.conti_banca && (
                      <span className="text-blue-500">{mutuo.conti_banca.nome_banca}</span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 bg-zinc-100 rounded-full h-1.5 w-full max-w-xs">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  {mutuo.importo_rata && (
                    <div className="text-right">
                      <p className="text-lg font-black text-foreground">{formatEuro(mutuo.importo_rata)}</p>
                      <p className="text-[10px] text-muted-foreground">/ rata</p>
                    </div>
                  )}
                  {isEspanso ? <ChevronUp size={18} className="text-zinc-400" /> : <ChevronDown size={18} className="text-zinc-400" />}
                </div>
              </div>

              {/* Dettaglio Rate */}
              {isEspanso && (
                <div className="border-t animate-in slide-in-from-top-1">
                  <div className="p-4">
                    {/* Info supplementari */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
                      {mutuo.numero_pratica && (
                        <div><span className="text-muted-foreground">Pratica:</span> <span className="font-medium">{mutuo.numero_pratica}</span></div>
                      )}
                      <div><span className="text-muted-foreground">Tasso:</span> <span className="font-medium capitalize">{mutuo.tipo_tasso}</span> {mutuo.taeg_isc && `(${mutuo.taeg_isc}%)`}</div>
                      <div><span className="text-muted-foreground">Periodicità:</span> <span className="font-medium capitalize">{mutuo.periodicita}</span></div>
                      {mutuo.data_stipula && (
                        <div><span className="text-muted-foreground">Stipula:</span> <span className="font-medium">{formatData(mutuo.data_stipula)}</span></div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-[10px] font-bold uppercase text-zinc-500">Importo per estinzione</p>
                        <p className="text-base font-black text-zinc-900">{formatEuro(debitoResiduoMutuo)}</p>
                      </div>
                      {haBreakdownMutuo && (
                        <>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <p className="text-[10px] font-bold uppercase text-blue-600">Capitale residuo</p>
                            <p className="text-base font-black text-blue-900">{formatEuro(capitaleResiduoMutuo)}</p>
                          </div>
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[10px] font-bold uppercase text-amber-600">Interessi residui</p>
                            <p className="text-base font-black text-amber-900">{formatEuro(interessiResiduiMutuo)}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Tabella rate */}
                    {rate.length > 0 ? (
                      <div className="rounded-md border bg-white max-h-[300px] overflow-y-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-zinc-50 text-zinc-500 border-b sticky top-0">
                            <tr>
                              <th className="p-2 font-medium">#</th>
                              <th className="p-2 font-medium">Scadenza</th>
                              <th className="p-2 font-medium text-right">Importo</th>
                              <th className="p-2 font-medium text-center">Stato</th>
                              <th className="p-2 font-medium">Pagamento</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {rate.map(r => {
                              const isScaduta = r.stato === 'da_pagare' && new Date(r.data_scadenza) < new Date()
                              return (
                                <tr key={r.id} className={`hover:bg-zinc-50 transition-colors ${isScaduta ? 'bg-red-50/50' : ''}`}>
                                  <td className="p-2 text-zinc-500">{r.numero_rata}</td>
                                  <td className="p-2">{formatData(r.data_scadenza)}</td>
                                  <td className="p-2 text-right font-medium">{formatEuro(r.importo_rata)}</td>
                                  <td className="p-2 text-center">
                                    {r.stato === 'pagato' ? (
                                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                        <CheckCircle2 size={10} className="mr-1" /> Pagato
                                      </Badge>
                                    ) : isScaduta ? (
                                      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                                        <AlertTriangle size={10} className="mr-1" /> Scaduta
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] bg-zinc-50 text-zinc-600 border-zinc-200">
                                        <Clock size={10} className="mr-1" /> Da pagare
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2 text-zinc-500">{r.data_pagamento ? formatData(r.data_pagamento) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-zinc-400 text-xs italic">Nessuna rata trovata</p>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
