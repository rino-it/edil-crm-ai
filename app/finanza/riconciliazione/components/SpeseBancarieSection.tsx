'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Receipt, TrendingDown, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import type { SpesaMensile } from '@/utils/data-fetcher'

interface SpeseBancarieProps {
  speseMensili: SpesaMensile[];
  annoSelezionato: number;
  anni: number[];
}

const MESI_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

function formatEuro(val: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
}

function formatMese(mese: string) {
  const parts = mese.split('-')
  const mm = parts[1]
  const yy = parts[0]
  return `${MESI_LABELS[mm] ?? mm} ${yy}`
}

export function SpeseBancarieSection({ speseMensili, annoSelezionato, anni }: SpeseBancarieProps) {
  const [aperta, setAperta] = useState(false)
  const [meseEspanso, setMeseEspanso] = useState<string | null>(null)

  // KPI
  const totaleAnno = speseMensili.reduce((acc, m) => acc + m.totale, 0)
  const mediaMensile = speseMensili.length > 0 ? totaleAnno / speseMensili.length : 0
  const mesePiuCaro = speseMensili.length > 0
    ? speseMensili.reduce((max, m) => m.totale > max.totale ? m : max, speseMensili[0])
    : null

  const maxTotale = speseMensili.length > 0
    ? Math.max(...speseMensili.map(m => m.totale))
    : 1

  if (totaleAnno === 0 && speseMensili.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-sm)] border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Receipt className="h-5 w-5 text-rose-500" />
            <CardTitle className="text-base font-bold text-foreground">Spese e Commissioni Bancarie</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground bg-zinc-100 px-2 py-0.5 rounded">{annoSelezionato}</span>
          </div>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nessuna commissione bancaria trovata per il {annoSelezionato}.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-[var(--shadow-sm)] border-border/60">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-3 flex-wrap">
          <Receipt className="h-5 w-5 text-rose-500 shrink-0" />
          <CardTitle className="text-base font-bold text-foreground">Spese e Commissioni Bancarie</CardTitle>
          
          {/* Selettore anno */}
          <div className="flex items-center gap-1 ml-auto">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {anni.map(a => (
              <a
                key={a}
                href={`?anno=${a}`}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  a === annoSelezionato
                    ? 'bg-rose-100 text-rose-700 font-bold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {a}
              </a>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setAperta(!aperta)}
          >
            {aperta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {aperta ? 'Comprimi' : 'Espandi'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
            <p className="text-xs font-bold text-rose-600 uppercase">Totale Anno {annoSelezionato}</p>
            <p className="text-2xl font-black text-rose-700 mt-0.5">{formatEuro(totaleAnno)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
            <p className="text-xs font-bold text-orange-600 uppercase">Media Mensile</p>
            <p className="text-2xl font-black text-orange-700 mt-0.5">{formatEuro(mediaMensile)}</p>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
            <p className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1">
              <TrendingDown size={12} /> Mese Più Caro
            </p>
            {mesePiuCaro ? (
              <>
                <p className="text-lg font-black text-zinc-800 mt-0.5">{formatMese(mesePiuCaro.mese)}</p>
                <p className="text-xs text-zinc-500">{formatEuro(mesePiuCaro.totale)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">—</p>
            )}
          </div>
        </div>

        {/* Tabella mensile espandibile */}
        {aperta && (
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground uppercase bg-muted/40">
                  <th className="text-left px-4 py-2.5">Mese</th>
                  <th className="text-center px-4 py-2.5">N° Addebiti</th>
                  <th className="text-right px-4 py-2.5">Totale €</th>
                  <th className="w-36 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {speseMensili.map((row, i) => {
                  const pct = maxTotale > 0 ? (row.totale / maxTotale) * 100 : 0
                  const isDettaglioAperto = meseEspanso === row.mese
                  return (
                    <>
                      <tr
                        key={row.mese}
                        className={`border-t border-border/30 cursor-pointer transition-colors ${
                          isDettaglioAperto ? 'bg-rose-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-muted/20'
                        } hover:bg-rose-50/30`}
                        onClick={() => setMeseEspanso(isDettaglioAperto ? null : row.mese)}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{formatMese(row.mese)}</td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{row.conteggio}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-rose-700">{formatEuro(row.totale)}</td>
                        <td className="px-4 py-2.5">
                          <div className="w-full bg-zinc-100 rounded-full h-1.5">
                            <div
                              className="bg-rose-400 h-1.5 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                      {isDettaglioAperto && row.movimenti && row.movimenti.length > 0 && (
                        <tr key={`${row.mese}-detail`}>
                          <td colSpan={4} className="p-0 border-t border-rose-200">
                            <div className="bg-rose-50/40 p-4">
                              <p className="text-xs font-bold text-rose-700 uppercase mb-2">
                                Dettaglio {formatMese(row.mese)} — {row.movimenti.length} commissione{row.movimenti.length !== 1 ? 'i' : 'e'}
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[10px] font-bold text-muted-foreground uppercase">
                                    <th className="text-left px-3 py-1.5">Data</th>
                                    <th className="text-left px-3 py-1.5">Causale</th>
                                    <th className="text-left px-3 py-1.5">Note</th>
                                    <th className="text-right px-3 py-1.5">Importo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.movimenti.map(m => (
                                    <tr key={m.id} className="border-t border-rose-100/60 hover:bg-rose-50/60">
                                      <td className="px-3 py-1.5 whitespace-nowrap">
                                        {new Date(m.data_operazione).toLocaleDateString('it-IT')}
                                      </td>
                                      <td className="px-3 py-1.5 font-mono max-w-[280px]">
                                        <span className="truncate block" title={m.descrizione}>{m.descrizione}</span>
                                      </td>
                                      <td className="px-3 py-1.5 text-zinc-500 italic max-w-[200px]">
                                        <span className="truncate block" title={m.note_riconciliazione || ''}>
                                          {m.note_riconciliazione || '—'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-bold text-rose-600">
                                        {formatEuro(Math.abs(m.importo))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              {speseMensili.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/30">
                    <td className="px-4 py-2.5 font-bold text-foreground">Totale</td>
                    <td className="px-4 py-2.5 text-center font-bold text-foreground">
                      {speseMensili.reduce((acc, m) => acc + m.conteggio, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-rose-700">{formatEuro(totaleAnno)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
