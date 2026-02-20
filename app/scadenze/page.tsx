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
  Plus
} from "lucide-react"
import Link from 'next/link'
// NUOVO IMPORT: Il Client Component per gestire l'onChange
import { CantiereFilter } from "@/components/CantiereFilter"

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
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <CalendarCheck className="h-8 w-8 text-blue-600" /> Scadenziario Pagamenti
            </h1>
            <p className="text-zinc-500">Gestione flussi di cassa e monitoraggio tempi medi di incasso.</p>
          </div>
          
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Nuova Scadenza
          </Button>
        </div>

        {/* Banner Errore */}
        {params.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {params.error}
          </div>
        )}

        {/* KPI Cards (Priorità Crediti) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-green-500 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wider">💰 Da Incassare</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{formatEuro(kpis.da_incassare)}</div>
              <p className="text-[10px] text-zinc-400 mt-1">Crediti clienti attivi</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wider">💸 Da Pagare</CardTitle>
              <Wallet className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{formatEuro(kpis.da_pagare)}</div>
              <p className="text-[10px] text-zinc-400 mt-1">Debiti fornitori aperti</p>
            </CardContent>
          </Card>

          <Card className={`border-l-4 border-l-red-600 shadow-sm ${kpis.scaduto > 0 ? 'bg-red-50 animate-pulse' : 'bg-white'}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-red-600 uppercase tracking-wider">⚠️ Scaduto</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-red-700">{formatEuro(kpis.scaduto)}</div>
              <p className="text-[10px] text-red-400 mt-1 font-medium italic">Richiede sollecito immediato!</p>
            </CardContent>
          </Card>

          <Card className={`border-l-4 shadow-sm bg-white ${kpis.dso > 60 ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wider">📊 DSO (Incasso Medio)</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{kpis.dso} <span className="text-sm font-medium text-zinc-400">gg</span></div>
              <p className="text-[10px] text-zinc-400 mt-1">Target aziendale: &lt; 60gg</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtri e Navigazione */}
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="border-b border-zinc-100 bg-white rounded-t-xl">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              {/* Tabs Rapidi */}
              <div className="flex bg-zinc-100 p-1 rounded-lg w-full md:w-auto">
                <Link 
                  href="/scadenze" 
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium text-center transition-all ${(!params.tipo && !params.stato) ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Tutte
                </Link>
                <Link 
                  href="/scadenze?tipo=entrata" 
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium text-center transition-all ${params.tipo === 'entrata' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Entrate
                </Link>
                <Link 
                  href="/scadenze?tipo=uscita" 
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium text-center transition-all ${params.tipo === 'uscita' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Uscite
                </Link>
                <Link 
                  href="/scadenze?stato=scaduto" 
                  className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium text-center transition-all ${params.stato === 'scaduto' ? 'bg-white shadow-sm text-red-600' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Scadute
                </Link>
              </div>

              {/* Filtro Cantiere (Usando il nuovo Client Component) */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Filter size={14} className="text-zinc-400" />
                <CantiereFilter cantieri={cantieri} currentId={params.cantiere_id} />
              </div>
            </div>
          </CardHeader>

          {/* Tabella Scadenze */}
          <CardContent className="p-0 bg-white overflow-x-auto">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="w-[200px]">Soggetto / Cantiere</TableHead>
                  <TableHead>Fattura / Rif.</TableHead>
                  <TableHead className="text-right">Importo Totale</TableHead>
                  <TableHead className="text-right">Pagato / Residuo</TableHead>
                  <TableHead>Data Scadenza</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scadenze.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-20 text-zinc-400 italic">
                      <CalendarCheck className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      Nessuna scadenza trovata con i filtri selezionati.
                    </TableCell>
                  </TableRow>
                ) : (
                  scadenze.map((s) => (
                    <TableRow key={s.id} className="hover:bg-zinc-50/80 transition-colors group">
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-zinc-900 truncate">{s.soggetto?.ragione_sociale || 'N/D'}</span>
                          <span className="text-[10px] uppercase font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded w-fit">
                            {s.cantiere?.nome || 'Spese Generali'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 font-mono">
                        {s.fattura_riferimento || s.descrizione || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-zinc-900">
                        {formatEuro(s.importo_totale)}
                      </TableCell>
                      <TableCell className="text-right text-[11px]">
                        <div className="flex flex-col">
                          <span className="text-emerald-600 font-semibold">{formatEuro(s.importo_pagato)}</span>
                          <span className={`font-black ${s.importo_residuo > 0 ? 'text-rose-600' : 'text-zinc-300'}`}>
                            {formatEuro(s.importo_residuo)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {new Date(s.data_scadenza).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          s.stato === 'pagato' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          s.stato === 'scaduto' ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold' :
                          s.stato === 'parziale' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-zinc-50 text-zinc-500 border-zinc-200'
                        }>
                          {s.stato.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.stato !== 'pagato' && (
                            <Link href={`/scadenze?pagamento_id=${s.id}`}>
                              <Button variant="outline" size="sm" className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400 transition-all">
                                <CheckCircle2 size={14} className="mr-1.5" /> Paga
                              </Button>
                            </Link>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-zinc-600">
                            <MoreHorizontal size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal Mini-form Pagamento (Overlay se pagamento_id presente) */}
        {params.pagamento_id && (
          <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-md shadow-2xl border-zinc-200 bg-white">
              <CardHeader className="border-b border-zinc-50 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500" /> Registra Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form action={segnaComePagato} className="space-y-5">
                  <input type="hidden" name="scadenza_id" value={params.pagamento_id} />
                  
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-zinc-500">Importo da registrare (€)</label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      name="importo_pagamento" 
                      placeholder="0.00" 
                      className="text-lg font-mono font-bold h-12"
                      required 
                      autoFocus
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase text-zinc-500">Data Operazione</label>
                      <Input 
                        type="date" 
                        name="data_pagamento" 
                        defaultValue={new Date().toISOString().split('T')[0]} 
                        className="h-10 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase text-zinc-500">Metodo</label>
                      <select name="metodo_pagamento" className="w-full h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="Bonifico">Bonifico</option>
                        <option value="RIBA">RIBA</option>
                        <option value="Contanti">Contanti</option>
                        <option value="Assegno">Assegno</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <Link href="/scadenze" className="flex-1">
                      <Button variant="outline" type="button" className="w-full h-11">Annulla</Button>
                    </Link>
                    <Button type="submit" className="flex-1 bg-zinc-900 hover:bg-black text-white h-11 font-bold">Conferma Pagamento</Button>
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