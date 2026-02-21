import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getScadenze, getKPIScadenze, getCantieriAttivi } from '@/utils/data-fetcher'
import { segnaComePagato } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  CalendarCheck, 
  TrendingUp, 
  Wallet, 
  AlertTriangle, 
  BarChart3,
  Filter,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  ArrowRight
} from "lucide-react"
import Link from 'next/link'
import { CantiereFilter } from "@/components/CantiereFilter"
import { AssegnaCantiereSelect } from "@/components/AssegnaCantiereSelect"

export default async function ScadenzePage({
  searchParams,
}: {
  searchParams: Promise<{ 
    tipo?: string; 
    stato?: string; 
    cantiere_id?: string;
    pagamento_id?: string;
    error?: string;
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const scadenze = await getScadenze({
    tipo: params.tipo,
    stato: params.stato,
    cantiere_id: params.cantiere_id
  })
  const kpis = await getKPIScadenze()
  const cantieri = await getCantieriAttivi()

  const formatEuro = (val: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8 pb-24">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <CalendarCheck className="h-6 w-6 md:h-8 md:w-8 text-blue-600" /> Scadenziario
            </h1>
            <p className="text-sm text-zinc-500">Monitoraggio flussi di cassa e scadenze.</p>
          </div>
          
          <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 h-12 md:h-10">
            <Plus className="mr-2 h-4 w-4" /> Nuova Scadenza
          </Button>
        </div>

        {/* Banner Errore */}
        {params.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
            {params.error}
          </div>
        )}

        {/* KPI Cards: Griglia responsiva */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-green-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase">💰 Da Incassare</CardTitle>
              <TrendingUp size={16} className="text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black">{formatEuro(kpis.da_incassare)}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase">💸 Da Pagare</CardTitle>
              <Wallet size={16} className="text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black">{formatEuro(kpis.da_pagare)}</div>
            </CardContent>
          </Card>

          <Card className={`border-l-4 border-l-red-600 shadow-sm ${kpis.scaduto > 0 ? 'bg-red-50' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-bold text-red-600 uppercase">⚠️ Scaduto</CardTitle>
              <AlertTriangle size={16} className="text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black text-red-700">{formatEuro(kpis.scaduto)}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-bold text-zinc-500 uppercase">📊 DSO</CardTitle>
              <BarChart3 size={16} className="text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-black">{kpis.dso} <span className="text-xs font-normal text-zinc-400">gg</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Filtri */}
        <Card className="shadow-sm border-zinc-200 overflow-hidden">
          <div className="p-4 bg-white border-b border-zinc-100">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex flex-wrap justify-center md:justify-start gap-1 bg-zinc-100 p-1 rounded-xl w-full md:w-auto">
                {['Tutte', 'Entrate', 'Uscite', 'Scadute'].map((label) => {
                  const href = label === 'Tutte' ? '/scadenze' : 
                               label === 'Scadute' ? '/scadenze?stato=scaduto' : 
                               `/scadenze?tipo=${label.toLowerCase().slice(0, -1)}a`;
                  const active = (label === 'Tutte' && !params.tipo && !params.stato) ||
                                 (label === 'Scadute' && params.stato === 'scaduto') ||
                                 (params.tipo === label.toLowerCase().slice(0, -1) + 'a');
                  return (
                    <Link key={label} href={href} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${active ? 'bg-white shadow-sm text-blue-600' : 'text-zinc-500'}`}>
                      {label}
                    </Link>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <CantiereFilter cantieri={cantieri} currentId={params.cantiere_id !== 'null' ? params.cantiere_id : undefined} />
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            
            {/* VISTA DESKTOP: Tabella (nascosta su mobile) */}
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-zinc-50/50">
                  <TableRow>
                    <TableHead>Soggetto / Cantiere</TableHead>
                    <TableHead>Fattura / Rif.</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead className="text-right">Residuo</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scadenze.map((s) => (
                    <TableRow key={s.id} className="hover:bg-zinc-50/80 transition-colors">
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-zinc-900">{s.soggetto?.ragione_sociale || 'N/D'}</span>
                          <AssegnaCantiereSelect scadenzaId={s.id} currentCantiereId={(s.cantiere as any)?.id || null} cantieri={cantieri} />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{s.fattura_riferimento || '-'}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatEuro(s.importo_totale)}</TableCell>
                      <TableCell className="text-right text-rose-600 font-black">{formatEuro(s.importo_residuo)}</TableCell>
                      <TableCell className="text-sm font-medium">{new Date(s.data_scadenza).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.stato === 'pagato' ? 'bg-emerald-50 text-emerald-700' : s.stato === 'scaduto' ? 'bg-rose-50 text-rose-700' : ''}>
                          {s.stato.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.stato !== 'pagato' && (
                          <Link href={`/scadenze?pagamento_id=${s.id}`}>
                            <Button variant="outline" size="sm" className="h-8 text-blue-600"><CheckCircle2 size={14} className="mr-1" /> Paga</Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* VISTA MOBILE: Cards (nascosta su desktop) */}
            <div className="md:hidden divide-y divide-zinc-100">
              {scadenze.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 italic">Nessun dato.</div>
              ) : (
                scadenze.map((s) => (
                  <div key={s.id} className="p-4 space-y-4 bg-white active:bg-zinc-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 max-w-[65%]">
                        <div className="font-black text-zinc-900 text-sm leading-tight uppercase truncate">
                          {s.soggetto?.ragione_sociale || 'N/D'}
                        </div>
                        <AssegnaCantiereSelect 
                          scadenzaId={s.id} 
                          currentCantiereId={(s.cantiere as any)?.id || null} 
                          cantieri={cantieri} 
                        />
                      </div>
                      <div className="text-right">
                        <div className="text-base font-black text-zinc-900">{formatEuro(s.importo_totale)}</div>
                        <Badge variant="outline" className={`text-[9px] h-5 ${s.stato === 'scaduto' ? 'border-rose-200 text-rose-600 bg-rose-50' : ''}`}>
                          {s.stato.toUpperCase()}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                      <div>
                        <div className="text-[9px] font-bold text-zinc-400 uppercase">Residuo</div>
                        <div className={`text-sm font-black ${s.importo_residuo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {formatEuro(s.importo_residuo)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-zinc-400 uppercase">Scadenza</div>
                        <div className="text-sm font-bold text-zinc-700">
                          {new Date(s.data_scadenza).toLocaleDateString('it-IT')}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {s.stato !== 'pagato' && (
                        <Link href={`/scadenze?pagamento_id=${s.id}`} className="flex-1">
                          <Button className="w-full h-11 bg-blue-600 font-bold rounded-xl shadow-md shadow-blue-100">
                            Registra Pagamento <ArrowRight size={16} className="ml-2" />
                          </Button>
                        </Link>
                      )}
                      <Button variant="outline" className="h-11 w-12 rounded-xl border-zinc-200">
                        <MoreHorizontal size={18} className="text-zinc-400" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </CardContent>
        </Card>

        {/* Modal Pagamento (sempre centrato e pulito) */}
        {params.pagamento_id && (
          <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <Card className="w-full max-w-md shadow-2xl rounded-2xl border-none">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg font-black uppercase flex items-center justify-center gap-2">
                  <CheckCircle2 className="text-emerald-500" /> Conferma Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <form action={segnaComePagato} className="space-y-6">
                  <input type="hidden" name="scadenza_id" value={params.pagamento_id} />
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Importo Versato (€)</label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="importo_pagamento" 
                      className="h-14 text-2xl font-black text-center rounded-2xl border-zinc-200"
                      required 
                      autoFocus
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Data</label>
                      <Input type="date" name="data_pagamento" defaultValue={new Date().toISOString().split('T')[0]} className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-zinc-400 ml-1">Metodo</label>
                      <select name="metodo_pagamento" className="w-full h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold">
                        <option>Bonifico</option>
                        <option>Contanti</option>
                        <option>Assegno</option>
                        <option>RIBA</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button type="submit" className="w-full h-14 bg-zinc-900 text-white font-black rounded-2xl text-base">Conferma Operazione</Button>
                    <Link href="/scadenze" className="w-full">
                      <Button variant="ghost" type="button" className="w-full h-10 text-zinc-400 font-bold">Annulla</Button>
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  )
}