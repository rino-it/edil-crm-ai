'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Repeat, ChevronDown, ChevronUp, Calendar, Car, Shield, Home, BarChart3 } from 'lucide-react'
import type { CostoRicorrenteMensile } from '@/utils/data-fetcher'

interface CostiRicorrentiProps {
  costiMensili: CostoRicorrenteMensile[];
  annoSelezionato: number;
  anni: number[];
}

const MESI_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

const CATEGORIE_CONFIG = {
  leasing: { label: 'Leasing', icon: Car, color: 'amber', bgKpi: 'bg-amber-50 border-amber-100', textKpi: 'text-amber-700', labelKpi: 'text-amber-600', bar: 'bg-amber-400' },
  assicurazione: { label: 'Assicurazioni', icon: Shield, color: 'indigo', bgKpi: 'bg-indigo-50 border-indigo-100', textKpi: 'text-indigo-700', labelKpi: 'text-indigo-600', bar: 'bg-indigo-400' },
  mutuo: { label: 'Mutuo', icon: Home, color: 'stone', bgKpi: 'bg-stone-50 border-stone-200', textKpi: 'text-stone-700', labelKpi: 'text-stone-600', bar: 'bg-stone-400' },
  interessi_bancari: { label: 'Interessi', icon: BarChart3, color: 'red', bgKpi: 'bg-red-50 border-red-100', textKpi: 'text-red-700', labelKpi: 'text-red-600', bar: 'bg-red-400' },
} as const;

function formatEuro(val: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
}

function formatMese(mese: string) {
  const parts = mese.split('-')
  return `${MESI_LABELS[parts[1]] ?? parts[1]} ${parts[0]}`
}

export function CostiRicorrentiSection({ costiMensili, annoSelezionato, anni }: CostiRicorrentiProps) {
  const [aperta, setAperta] = useState(false)
  const [meseEspanso, setMeseEspanso] = useState<string | null>(null)
  const [categoriaFocus, setCategoriaFocus] = useState<keyof typeof CATEGORIE_CONFIG | null>(null)

  // KPI aggregati
  const totaleLeasing = costiMensili.reduce((acc, m) => acc + m.totale_leasing, 0)
  const totaleAssicurazione = costiMensili.reduce((acc, m) => acc + m.totale_assicurazione, 0)
  const totaleMutuo = costiMensili.reduce((acc, m) => acc + m.totale_mutuo, 0)
  const totaleInteressi = costiMensili.reduce((acc, m) => acc + m.totale_interessi, 0)
  const totaleGenerale = totaleLeasing + totaleAssicurazione + totaleMutuo + totaleInteressi
  const mesiConDati = costiMensili.length
  const mediaMensile = mesiConDati > 0 ? totaleGenerale / mesiConDati : 0

  // Max per scala barre
  const maxMensile = Math.max(
    ...costiMensili.map(m => m.totale_leasing + m.totale_assicurazione + m.totale_mutuo + m.totale_interessi),
    1
  )

  if (totaleGenerale === 0 && costiMensili.length === 0) {
    return (
      <Card className="shadow-[var(--shadow-sm)] border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Repeat className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base font-bold text-foreground">Costi Ricorrenti</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground bg-zinc-100 px-2 py-0.5 rounded">{annoSelezionato}</span>
          </div>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nessun costo ricorrente trovato per il {annoSelezionato}.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-[var(--shadow-sm)] border-border/60">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center gap-3 flex-wrap">
          <Repeat className="h-5 w-5 text-amber-500 shrink-0" />
          <CardTitle className="text-base font-bold text-foreground">Costi Ricorrenti</CardTitle>
          <Badge variant="outline" className="text-[10px] h-5 border-none bg-zinc-100 text-zinc-600">
            Leasing · Assicurazione · Mutuo · Interessi
          </Badge>

          {/* Selettore anno */}
          <div className="flex items-center gap-1 ml-auto">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {anni.map(a => (
              <a
                key={a}
                href={`?anno=${a}`}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  a === annoSelezionato
                    ? 'bg-amber-100 text-amber-700 font-bold'
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
        {/* KPI Row — una card per tipo + totale + media */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(Object.entries(CATEGORIE_CONFIG) as [keyof typeof CATEGORIE_CONFIG, typeof CATEGORIE_CONFIG[keyof typeof CATEGORIE_CONFIG]][]).map(([key, cfg]) => {
            const totale = key === 'leasing' ? totaleLeasing : key === 'assicurazione' ? totaleAssicurazione : key === 'mutuo' ? totaleMutuo : totaleInteressi;
            if (totale === 0) return null;
            const Icon = cfg.icon;
            const isActive = categoriaFocus === key;
            return (
              <div
                key={key}
                className={`${cfg.bgKpi} border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${isActive ? 'ring-2 ring-offset-1 ring-current' : 'hover:brightness-95'}`}
                onClick={() => setCategoriaFocus(isActive ? null : key)}
                title={`Clicca per vedere tutti i movimenti ${cfg.label}`}
              >
                <p className={`text-[10px] font-bold ${cfg.labelKpi} uppercase flex items-center gap-1`}>
                  <Icon size={11} /> {cfg.label}
                  {isActive && <span className="ml-auto">▲</span>}
                </p>
                <p className={`text-lg font-black ${cfg.textKpi} mt-0.5`}>{formatEuro(totale)}</p>
              </div>
            );
          })}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase">Totale Anno</p>
            <p className="text-lg font-black text-zinc-800 mt-0.5">{formatEuro(totaleGenerale)}</p>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase">Media Mensile</p>
            <p className="text-lg font-black text-zinc-800 mt-0.5">{formatEuro(mediaMensile)}</p>
          </div>
        </div>

        {/* Drilldown annuale per categoria — si apre cliccando la card KPI */}
        {categoriaFocus && (() => {
          const cfgFocus = CATEGORIE_CONFIG[categoriaFocus];
          const tuttiMovimenti = costiMensili
            .flatMap(m => m.dettagli)
            .filter(d => d.categoria_dedotta === categoriaFocus)
            .sort((a, b) => new Date(a.data_operazione).getTime() - new Date(b.data_operazione).getTime());
          const totaleAnno = tuttiMovimenti.reduce((acc, d) => acc + Math.abs(d.importo), 0);
          return (
            <div className={`rounded-lg border ${cfgFocus.bgKpi} p-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${cfgFocus.textKpi} uppercase flex items-center gap-2`}>
                  <cfgFocus.icon size={14} />
                  Tutti i movimenti {cfgFocus.label} — {annoSelezionato}
                  <span className="font-normal text-xs opacity-70">({tuttiMovimenti.length} mov.)</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-black ${cfgFocus.textKpi}`}>{formatEuro(totaleAnno)}</span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-current opacity-50 hover:opacity-100 transition-opacity"
                    onClick={() => setCategoriaFocus(null)}
                  >
                    ✕ Chiudi
                  </button>
                </div>
              </div>
              {tuttiMovimenti.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun movimento trovato.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold text-muted-foreground uppercase border-b">
                      <th className="text-left px-3 py-1.5">Data</th>
                      <th className="text-left px-3 py-1.5">Descrizione</th>
                      <th className="text-left px-3 py-1.5">Soggetto</th>
                      <th className="text-right px-3 py-1.5">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tuttiMovimenti.map(d => (
                      <tr key={d.id} className="border-t border-border/20 hover:bg-white/60 transition-colors">
                        <td className="px-3 py-1.5 whitespace-nowrap font-medium">{new Date(d.data_operazione).toLocaleDateString('it-IT')}</td>
                        <td className="px-3 py-1.5 font-mono max-w-[300px]">
                          <span className="truncate block" title={d.descrizione}>{d.descrizione}</span>
                          {d.note_riconciliazione && <p className="text-[10px] text-zinc-500 italic mt-0.5 font-sans">{d.note_riconciliazione}</p>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-600">{d.ragione_sociale || '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${cfgFocus.textKpi}`}>{formatEuro(Math.abs(d.importo))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}

        {/* Tabella mensile espandibile con barre stacked */}
        {aperta && (
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground uppercase bg-muted/40">
                  <th className="text-left px-4 py-2.5">Mese</th>
                  <th className="text-right px-4 py-2.5">Leasing</th>
                  <th className="text-right px-4 py-2.5">Assicuraz.</th>
                  <th className="text-right px-4 py-2.5">Mutuo</th>
                  <th className="text-right px-4 py-2.5">Interessi</th>
                  <th className="text-right px-4 py-2.5">Totale</th>
                  <th className="w-32 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {costiMensili.map((row, i) => {
                  const totaleMese = row.totale_leasing + row.totale_assicurazione + row.totale_mutuo + row.totale_interessi;
                  const pctTot = maxMensile > 0 ? (totaleMese / maxMensile) * 100 : 0;
                  // Percentuali per stacked bar
                  const pctL = totaleMese > 0 ? (row.totale_leasing / totaleMese) * pctTot : 0;
                  const pctA = totaleMese > 0 ? (row.totale_assicurazione / totaleMese) * pctTot : 0;
                  const pctM = totaleMese > 0 ? (row.totale_mutuo / totaleMese) * pctTot : 0;
                  const pctI = totaleMese > 0 ? (row.totale_interessi / totaleMese) * pctTot : 0;
                  const isDettaglioAperto = meseEspanso === row.mese;

                  return (
                    <tr
                      key={row.mese}
                      className={`border-t border-border/30 cursor-pointer transition-colors ${isDettaglioAperto ? 'bg-amber-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-muted/20'} hover:bg-amber-50/30`}
                      onClick={() => setMeseEspanso(isDettaglioAperto ? null : row.mese)}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{formatMese(row.mese)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 font-medium">{row.totale_leasing > 0 ? formatEuro(row.totale_leasing) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-indigo-700 font-medium">{row.totale_assicurazione > 0 ? formatEuro(row.totale_assicurazione) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-stone-700 font-medium">{row.totale_mutuo > 0 ? formatEuro(row.totale_mutuo) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-red-700 font-medium">{row.totale_interessi > 0 ? formatEuro(row.totale_interessi) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-zinc-800">{formatEuro(totaleMese)}</td>
                      <td className="px-4 py-2.5">
                        <div className="w-full bg-zinc-100 rounded-full h-2 flex overflow-hidden">
                          {pctL > 0 && <div className="bg-amber-400 h-2 transition-all" style={{ width: `${pctL}%` }} />}
                          {pctA > 0 && <div className="bg-indigo-400 h-2 transition-all" style={{ width: `${pctA}%` }} />}
                          {pctM > 0 && <div className="bg-stone-400 h-2 transition-all" style={{ width: `${pctM}%` }} />}
                          {pctI > 0 && <div className="bg-red-400 h-2 transition-all" style={{ width: `${pctI}%` }} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {costiMensili.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/30">
                    <td className="px-4 py-2.5 font-bold text-foreground">Totale</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-700">{totaleLeasing > 0 ? formatEuro(totaleLeasing) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-indigo-700">{totaleAssicurazione > 0 ? formatEuro(totaleAssicurazione) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-stone-700">{totaleMutuo > 0 ? formatEuro(totaleMutuo) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-700">{totaleInteressi > 0 ? formatEuro(totaleInteressi) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-black text-zinc-800">{formatEuro(totaleGenerale)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>

            {/* Dettaglio movimenti del mese espanso */}
            {meseEspanso && (() => {
              const datiMese = costiMensili.find(m => m.mese === meseEspanso);
              if (!datiMese || datiMese.dettagli.length === 0) return null;
              return (
                <div className="border-t border-amber-200 bg-amber-50/30 p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase mb-2">
                    Dettaglio {formatMese(meseEspanso)} — {datiMese.dettagli.length} movimenti
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold text-muted-foreground uppercase">
                        <th className="text-left px-3 py-1.5">Data</th>
                        <th className="text-left px-3 py-1.5">Tipo</th>
                        <th className="text-left px-3 py-1.5">Descrizione</th>
                        <th className="text-left px-3 py-1.5">Soggetto</th>
                        <th className="text-right px-3 py-1.5">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datiMese.dettagli.map(d => {
                        const cfgCat = CATEGORIE_CONFIG[d.categoria_dedotta as keyof typeof CATEGORIE_CONFIG];
                        return (
                          <tr key={d.id} className="border-t border-amber-100/60 hover:bg-amber-50/60">
                            <td className="px-3 py-1.5 whitespace-nowrap">{new Date(d.data_operazione).toLocaleDateString('it-IT')}</td>
                            <td className="px-3 py-1.5">
                              {cfgCat && (
                                <Badge variant="outline" className={`${CATEGORIE_CONFIG[d.categoria_dedotta as keyof typeof CATEGORIE_CONFIG]?.bgKpi || ''} border-none py-0 h-4 text-[9px]`}>
                                  {cfgCat.label}
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono max-w-[250px]">
                              <span className="truncate block" title={d.descrizione}>{d.descrizione}</span>
                              {d.note_riconciliazione && <p className="text-[10px] text-zinc-500 italic mt-0.5 font-sans">{d.note_riconciliazione}</p>}
                            </td>
                            <td className="px-3 py-1.5 text-zinc-600">{d.ragione_sociale || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-rose-600">{formatEuro(d.importo)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
