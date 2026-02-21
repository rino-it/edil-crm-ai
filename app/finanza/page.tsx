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
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Activity, 
  BarChart3, 
  HardHat,
  ChevronRight
} from 'lucide-react'

export const dynamic = 'force-dynamic' // Garantisce dati sempre freschi

export default async function FinanzaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetching parallelo dei dati per ottimizzare le prestazioni
  const [kpis, cashflowData, agingData, cantieriData] = await Promise.all([
    getKPIFinanziariGlob(),
    getCashflowPrevisionale(90),
    getAgingAnalysisData(),
    getFinanzaPerCantiere()
  ])

  const formatEuro = (val: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-blue-600" /> Finanza & Controllo
          </h1>
          <p className="text-zinc-500 mt-1">Monitoraggio flussi di cassa, scadenze e redditività commesse.</p>
        </div>

        {/* SEZIONE 1: KPI Globali */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-white shadow-sm border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center justify-between">
                Saldo Attuale <Wallet className="h-4 w-4 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-black ${kpis.cassa_attuale < kpis.soglia_alert ? 'text-rose-600' : 'text-zinc-900'}`}>
                {formatEuro(kpis.cassa_attuale)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center justify-between">
                Fatturato <TrendingUp className="h-4 w-4 text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-700">{formatEuro(kpis.fatturato)}</div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-l-4 border-l-rose-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center justify-between">
                Costi <TrendingDown className="h-4 w-4 text-rose-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-rose-700">{formatEuro(kpis.costi)}</div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center justify-between">
                Margine <Activity className="h-4 w-4 text-indigo-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-black ${kpis.margine >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
                {formatEuro(kpis.margine)}
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-white shadow-sm border-l-4 ${kpis.dso > 60 ? 'border-l-amber-500' : 'border-l-slate-500'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center justify-between">
                DSO <BarChart3 className="h-4 w-4 text-slate-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{kpis.dso} <span className="text-sm font-medium text-zinc-400">gg</span></div>
            </CardContent>
          </Card>
        </div>

        {/* SEZIONE 2 & 3: Grafici (Cashflow + Aging) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cashflow Previsionale */}
          <Card className="md:col-span-2 shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Proiezione Cashflow (90gg)</CardTitle>
              <CardDescription>Andamento stimato della cassa in base alle scadenze attive.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <CashflowChart data={cashflowData} soglia={kpis.soglia_alert} />
            </CardContent>
          </Card>

          {/* Aging Analysis */}
          <Card className="md:col-span-1 shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="text-lg">Aging Crediti</CardTitle>
              <CardDescription>Anzianità delle fatture da incassare.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <AgingChart data={agingData} />
            </CardContent>
          </Card>
        </div>

        {/* SEZIONE 4: Analisi di Commessa (Cantieri) */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-4 flex items-center gap-2">
            <HardHat className="h-5 w-5 text-zinc-400" /> Redditività per Cantiere
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {cantieriData.length === 0 ? (
              <div className="col-span-full text-zinc-500 text-sm italic">Nessun cantiere attivo rilevato.</div>
            ) : (
              cantieriData.map(cantiere => (
                <Link key={cantiere.id} href={`/cantieri/${cantiere.id}`}>
                  <Card className="group hover:shadow-md transition-all hover:border-blue-200 bg-white cursor-pointer h-full">
                    <CardHeader className="pb-2 flex flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold text-zinc-800 line-clamp-2 leading-tight">
                          {cantiere.nome}
                        </CardTitle>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-blue-500 transition-colors" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Barra completamento */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                          <span>Completamento</span>
                          <span>{cantiere.completamento}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full" 
                            style={{ width: `${cantiere.completamento}%` }}
                          />
                        </div>
                      </div>
                      
                      {/* Metriche */}
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