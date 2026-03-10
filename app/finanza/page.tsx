import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getKPIFinanziariGlob,
  getCashflowPrevisionale,
  getAgingAnalysisData,
  getFinanzaPerCantiere,
  getTopEsposizioniPerSoggetto
} from '@/utils/data-fetcher'
import AgingChart from './AgingChart'
import SyncPipelineButton from './components/SyncPipelineButton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Wallet, Activity, LineChart, HardHat, ChevronRight, AlertCircle, ArrowRight, Download, Printer, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FinanzaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetching Parallelo (Nota: Ora facciamo due chiamate all'Aging)
  const [kpis, cashflowData, agingCrediti, agingDebiti, cantieriData, topEsposizioni] = await Promise.all([
    getKPIFinanziariGlob(),
    getCashflowPrevisionale(90),
    getAgingAnalysisData('entrata'),
    getAgingAnalysisData('uscita'),
    getFinanzaPerCantiere(),
    getTopEsposizioniPerSoggetto(10)
  ])

  // Proiezioni T+30, T+60, T+90
  const proiezioneT30 = cashflowData[30]?.saldo ?? null
  const proiezioneT60 = cashflowData[60]?.saldo ?? null
  const proiezioneT90 = cashflowData[89]?.saldo ?? null

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header con Alert Cassa */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-blue-600" /> Finanza & Controllo
            </h1>
            <p className="text-zinc-500 mt-1">Cashflow reale, con impatto immediato dello storico arretrato.</p>
          </div>

          <div className="flex items-center gap-3">
            {kpis.cassa_attuale < 0 && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-medium animate-pulse">
                <AlertCircle size={16} /> Attenzione: Esposizione di cassa rilevata.
              </div>
            )}
            <SyncPipelineButton />
          </div>
        </div>

        {/* SEZIONE 1: KPI Globali (Cliccabili per navigare alle nuove pagine) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className={`shadow-[var(--shadow-sm)] border-border/60 ${kpis.cassa_attuale < 0 ? 'ring-1 ring-rose-500/20' : ''}`}>
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
              <div className="flex items-center justify-between gap-2">
                <div className={`h-2 w-2 rounded-full ${kpis.cassa_attuale < 0 ? 'bg-rose-500' : 'bg-blue-500'}`} />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                  Cassa (incluso arretrati)
                </CardTitle>
                <Wallet className={`h-4 w-4 ${kpis.cassa_attuale < 0 ? 'text-rose-500' : 'text-blue-500'}`} />
              </div>
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className={`text-lg md:text-2xl font-black ${kpis.cassa_attuale < 0 ? 'text-rose-600' : 'text-foreground'}`}>
                {formatEuro(kpis.cassa_attuale)}
              </div>
            </CardContent>
          </Card>

          <Link href="/finanza/da-incassare" className="block group h-full">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 h-full card-hover">
              <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                    Da Incassare
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent className="pt-3 md:pt-4">
                <div className="text-lg md:text-2xl font-black text-emerald-700 flex items-center gap-2">
                  {formatEuro(kpis.da_incassare)}
                  <ArrowRight size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Crediti aperti &rarr;</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finanza/da-pagare" className="block group h-full">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 h-full card-hover">
              <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500" />
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                    Esposizione Fornitori
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                </div>
              </CardHeader>
              <CardContent className="pt-3 md:pt-4">
                <div className="text-lg md:text-2xl font-black text-rose-700 flex items-center gap-2">
                  {formatEuro(kpis.esposizione_fornitori)}
                  <ArrowRight size={14} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Debiti aperti &rarr;</p>
              </CardContent>
            </Card>
          </Link>

          <Card className="shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
              <div className="flex items-center justify-between gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                  Bilancio Globale
                </CardTitle>
                <Activity className="h-4 w-4 text-indigo-500" />
              </div>
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className={`text-lg md:text-2xl font-black ${kpis.bilancio_globale >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                {formatEuro(kpis.bilancio_globale)}
              </div>
            </CardContent>
          </Card>

          {/* Sostituito: Da DSO a Programmazione Cashflow */}
          <Link href="/finanza/programmazione" className="block group h-full">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 h-full card-hover">
              <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                    Programmazione
                  </CardTitle>
                  <LineChart className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent className="pt-3 md:pt-4">
                <div className="text-base md:text-lg font-black text-blue-700 flex items-center gap-2">
                  Cashflow 90gg
                  <ArrowRight size={14} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Apri Simulatore &rarr;</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* SEZIONE 2: Cruscotto CFO — Proiezioni + Export */}
        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-4 border-b border-border/40">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Cruscotto CFO — Proiezione Liquidita&apos;
                </CardTitle>
                <CardDescription>
                  Proiezione basata su scadenze programmate.{' '}
                  <Link href="/finanza/programmazione" className="underline text-blue-600">Apri Simulatore Cashflow →</Link>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <a href="/api/report/cashflow?format=xlsx" download>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica Excel
                  </Button>
                </a>
                <a href="/api/report/cashflow?format=html" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="text-xs">
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Versione Stampabile
                  </Button>
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            {/* Proiezioni T+30 / T+60 / T+90 */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'T+30 giorni', valore: proiezioneT30 },
                { label: 'T+60 giorni', valore: proiezioneT60 },
                { label: 'T+90 giorni', valore: proiezioneT90 },
              ].map(p => (
                <div key={p.label} className={`rounded-lg border p-4 text-center ${p.valore !== null && p.valore < 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1">{p.label}</div>
                  <div className={`text-xl md:text-2xl font-black font-mono ${p.valore !== null && p.valore < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {p.valore !== null ? formatEuro(p.valore) : '—'}
                  </div>
                  {p.valore !== null && p.valore < 0 && (
                    <div className="text-[10px] text-rose-500 font-medium mt-1 flex items-center justify-center gap-1">
                      <AlertCircle size={10} /> Cassa negativa
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Top Esposizioni per Soggetto */}
            {topEsposizioni.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-zinc-700 mb-3">Top Esposizioni per Soggetto</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/80">
                      <TableRow>
                        <TableHead className="font-semibold">Soggetto</TableHead>
                        <TableHead className="font-semibold w-[70px]">Tipo</TableHead>
                        <TableHead className="text-right font-semibold w-[120px]">Crediti</TableHead>
                        <TableHead className="text-right font-semibold w-[120px]">Debiti</TableHead>
                        <TableHead className="text-right font-semibold w-[120px]">Netto</TableHead>
                        <TableHead className="text-right font-semibold w-[60px]">Fatt.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topEsposizioni.map((e, i) => (
                        <TableRow key={e.soggetto_id} className={i < 3 ? 'bg-amber-50/30' : ''}>
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEZIONE 3: Aging Analisi (Crediti + Debiti) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/finanza/scaduto?tab=crediti" className="group">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 card-hover h-full">
              <CardHeader className="pb-4 border-b border-border/40 flex flex-row justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <CardTitle className="text-sm">Ritardi Clienti (Da Incassare)</CardTitle>
                </div>
                <ArrowRight size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardHeader>
              <CardContent className="pt-4">
                <AgingChart data={agingCrediti} />
              </CardContent>
            </Card>
          </Link>

          <Link href="/finanza/scaduto?tab=debiti" className="group">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 card-hover h-full">
              <CardHeader className="pb-4 border-b border-border/40 flex flex-row justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500" />
                  <CardTitle className="text-sm">Ritardi Fornitori (Da Pagare)</CardTitle>
                </div>
                <ArrowRight size={14} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardHeader>
              <CardContent className="pt-4">
                <AgingChart data={agingDebiti} />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* SEZIONE 4: Analisi di Commessa (Intatta) */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mb-4 flex items-center gap-2">
            <HardHat className="h-5 w-5 text-muted-foreground" /> Redditività per Cantiere (Scadenze Assegnate)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {cantieriData.length === 0 ? (
              <div className="col-span-full text-muted-foreground text-sm italic">
                Nessun cantiere attivo, oppure nessuna fattura è stata ancora assegnata a un cantiere nello scadenziario.
              </div>
            ) : (
              cantieriData.map(cantiere => (
                <Link key={cantiere.id} href={`/cantieri/${cantiere.id}`}>
                  <Card className="group card-hover bg-white cursor-pointer h-full border-border/60">
                    <CardHeader className="pb-2 border-b border-border/40 flex flex-row items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                          {cantiere.nome}
                        </CardTitle>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-blue-500 transition-colors" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                          <span>Completamento</span>
                          <span>{cantiere.completamento}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${cantiere.completamento}%` }} />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-emerald-50 p-2 rounded-md">
                          <div className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Entrate</div>
                          <div className="font-mono font-semibold text-emerald-700">{formatEuro(cantiere.entrate)}</div>
                        </div>
                        <div className="bg-rose-50 p-2 rounded-md">
                          <div className="text-[9px] font-bold text-rose-600 uppercase mb-0.5">Uscite</div>
                          <div className="font-mono font-semibold text-rose-700">{formatEuro(cantiere.uscite)}</div>
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-zinc-100 flex justify-between items-center">
                        <span className="text-xs font-bold text-zinc-500">Margine:</span>
                        <span className={`text-sm font-black ${cantiere.margine >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                          {formatEuro(cantiere.margine)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}