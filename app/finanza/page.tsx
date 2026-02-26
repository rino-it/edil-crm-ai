import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { 
  getKPIFinanziariGlob, 
  getCashflowPrevisionale, 
  getAgingAnalysisData, 
  getFinanzaPerCantiere 
} from '@/utils/data-fetcher'
import CashflowChart from './CashflowChart'
import AgingChart from './AgingChart'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Wallet, Activity, LineChart, HardHat, ChevronRight, AlertCircle, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FinanzaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetching Parallelo (Nota: Ora facciamo due chiamate all'Aging)
  const [kpis, cashflowData, agingCrediti, agingDebiti, cantieriData] = await Promise.all([
    getKPIFinanziariGlob(),
    getCashflowPrevisionale(90),
    getAgingAnalysisData('entrata'), // Clienti in ritardo
    getAgingAnalysisData('uscita'),  // Fornitori che non abbiamo pagato (Dati da Excel!)
    getFinanzaPerCantiere()
  ])

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
          
          {kpis.cassa_attuale < 0 && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2 font-medium animate-pulse">
              <AlertCircle size={16} /> Attenzione: Esposizione di cassa rilevata.
            </div>
          )}
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
              <div className={`text-lg md:text-2xl font-black ${kpis.cassa_attuale < kpis.soglia_alert ? 'text-rose-600' : 'text-foreground'}`}>
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
                    Tot. Emesso
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent className="pt-3 md:pt-4">
                <div className="text-lg md:text-2xl font-black text-emerald-700 flex items-center gap-2">
                  {formatEuro(kpis.fatturato)}
                  <ArrowRight size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Da Incassare &rarr;</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finanza/da-pagare" className="block group h-full">
            <Card className="shadow-[var(--shadow-sm)] border-border/60 h-full card-hover">
              <CardHeader className="pb-1 md:pb-2 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500" />
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">
                    Tot. Impegnato
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                </div>
              </CardHeader>
              <CardContent className="pt-3 md:pt-4">
                <div className="text-lg md:text-2xl font-black text-rose-700 flex items-center gap-2">
                  {formatEuro(kpis.costi)}
                  <ArrowRight size={14} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Da Pagare &rarr;</p>
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
              <div className={`text-lg md:text-2xl font-black ${kpis.margine >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                {formatEuro(kpis.margine)}
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

        {/* SEZIONE 2 & 3: Grafici e Aging Analisi (Splittata e Cliccabile) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cashflow Previsionale (2 colonne) */}
          <Card className="lg:col-span-2 shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-lg flex justify-between items-center">
                Proiezione Liquidità (90gg)
                <Link href="/finanza/programmazione">
                  <span className="text-xs text-blue-600 font-normal hover:underline cursor-pointer">Apri Dettaglio Completo</span>
                </Link>
              </CardTitle>
              <CardDescription>Il punto iniziale include il peso di <strong>tutti i debiti/crediti scaduti nel passato</strong>.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <CashflowChart data={cashflowData} soglia={kpis.soglia_alert} />
            </CardContent>
          </Card>

          {/* Aging Analysis (1 colonna impilata, resa cliccabile) */}
          <div className="flex flex-col gap-6">
            <Link href="/finanza/scaduto?tab=crediti" className="group">
              <Card className="shadow-[var(--shadow-sm)] border-border/60 card-hover">
                <CardHeader className="pb-4 border-b border-border/40 flex flex-row justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <CardTitle className="text-sm">⚠️ Ritardi Clienti (Da Incassare)</CardTitle>
                  </div>
                  <ArrowRight size={14} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardHeader>
                <CardContent className="pt-4">
                  <AgingChart data={agingCrediti} />
                </CardContent>
              </Card>
            </Link>

            <Link href="/finanza/scaduto?tab=debiti" className="group">
              <Card className="shadow-[var(--shadow-sm)] border-border/60 card-hover">
                <CardHeader className="pb-4 border-b border-border/40 flex flex-row justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                    <CardTitle className="text-sm">⚠️ Ritardi Fornitori (Da Pagare)</CardTitle>
                  </div>
                  <ArrowRight size={14} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardHeader>
                <CardContent className="pt-4">
                  <AgingChart data={agingDebiti} />
                </CardContent>
              </Card>
            </Link>
          </div>
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