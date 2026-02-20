import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Wallet, TrendingDown, Hammer, FileText, Clock, ShoppingCart, ListChecks, User, HardHat, AlertTriangle, CheckCircle2, Info } from "lucide-react"

export default async function CantierePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // 1. Dati Cantiere
  const { data: cantiere, error: cantiereError } = await supabase
    .from('cantieri')
    .select('*')
    .eq('id', id)
    .single()

  if (cantiereError || !cantiere) notFound()

  // 2. Fetch Movimenti (Materiali/DDT)
  const { data: movimenti } = await supabase
    .from('movimenti')
    .select('*')
    .eq('cantiere_id', id)
    .order('data_movimento', { ascending: false })

  // 3. Fetch Presenze (Manodopera) - JOIN con tabella Personale per avere i nomi
  const { data: presenze } = await supabase
    .from('presenze')
    .select('*, personale(nome, ruolo)')
    .eq('cantiere_id', id)
    .order('data', { ascending: false })

  // 4. CALCOLI UNIFICATI
  const totaleMateriali = movimenti?.reduce((acc, mov) => acc + (mov.importo || 0), 0) || 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totaleManodopera = presenze?.reduce((acc, p: any) => acc + (p.costo_calcolato || 0), 0) || 0

  const totaleSpeso = totaleMateriali + totaleManodopera

  const budgetCosti = cantiere.budget || 0
  const valoreVendita = cantiere.valore_vendita || 0
  const residuoBudget = budgetCosti - totaleSpeso
  const margineReale = valoreVendita - totaleSpeso
  const percentualeSpesa = budgetCosti > 0 ? (totaleSpeso / budgetCosti) * 100 : 0

  // Helper per icone
  const getIcon = (tipo: string) => {
    switch(tipo) {
      case 'manodopera': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'materiale': return <ShoppingCart className="h-4 w-4 text-orange-500" />;
      default: return <FileText className="h-4 w-4 text-gray-500" />;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-2">
              <ArrowLeft size={16} />
              <Link href="/cantieri">Torna alla lista</Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              {cantiere.nome || cantiere.descrizione}
              <Badge variant={cantiere.stato === 'aperto' ? 'default' : 'secondary'}>
                {cantiere.stato}
              </Badge>
            </h1>
            <p className="text-zinc-500">{cantiere.indirizzo} • Cod: {cantiere.codice}</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {/* INIZIO MODIFICA: Aggiunto pulsante Archivio Documenti */}
            <Link href={`/cantieri/${id}/archivio`}>
              <Button variant="outline" className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                <FileText className="h-4 w-4" />
                Archivio Documenti
              </Button>
            </Link>
            {/* FINE MODIFICA */}
            
            <Link href={`/cantieri/${id}/computo`}>
              <Button variant="outline" className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Computo Metrico
              </Button>
            </Link>
            <Link href={`/cantieri/${id}/spesa`}>
              <Button className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                + Nuova Spesa / DDT
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs Finanziari */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Budget Costi</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€ {budgetCosti.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${percentualeSpesa > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(percentualeSpesa, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Residuo: € {residuoBudget.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Materiali</CardTitle>
              <ShoppingCart className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-700">€ {totaleMateriali.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">DDT e Fatture</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Manodopera</CardTitle>
              <HardHat className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-700">€ {totaleManodopera.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">Ore lavorate</p>
            </CardContent>
          </Card>

          {valoreVendita > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Valore Appalto</CardTitle>
                <TrendingDown className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-700">€ {valoreVendita.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
                <p className="text-xs text-muted-foreground mt-1">Quanto paga il cliente</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {valoreVendita > 0 ? 'Margine Utile' : 'Residuo Budget'}
              </CardTitle>
              <Hammer className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(valoreVendita > 0 ? margineReale : residuoBudget) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                € {(valoreVendita > 0 ? margineReale : residuoBudget).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Speso: {percentualeSpesa.toFixed(1)}% del budget
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabella Presenze Singole */}
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-blue-500" />
                    Rapportini & Manodopera
                </CardTitle>
            </CardHeader>
            <CardContent>
                {(!presenze || presenze.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground bg-zinc-50/50 rounded-lg border border-dashed">
                        Nessuna ora lavorata registrata.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Operaio</TableHead>
                                <TableHead>Ruolo</TableHead>
                                <TableHead>Descrizione</TableHead>
                                <TableHead className="text-right">Ore</TableHead>
                                <TableHead className="text-right">Costo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {presenze.map((p: any) => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-medium">
                                        {new Date(p.data).toLocaleDateString('it-IT')}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <User className="h-3 w-3 text-zinc-400" />
                                            <span className="font-medium text-zinc-700">
                                                {p.personale?.nome || 'Sconosciuto'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs font-normal">
                                            {p.personale?.ruolo || 'N/D'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-zinc-500">{p.descrizione || '-'}</TableCell>
                                    <TableCell className="text-right font-medium">{p.ore} h</TableCell>
                                    <TableCell className="text-right font-bold text-zinc-900">
                                        € {p.costo_calcolato?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>

        {/* Sezione Movimenti / Materiali */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-orange-500" />
                Storico Acquisti & Materiali
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!movimenti || movimenti.length === 0) ? (
              <div className="text-center py-10 text-muted-foreground bg-zinc-50/50 rounded-lg border border-dashed">
                Nessuna spesa registrata per questo cantiere.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Allegato</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimenti.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {new Date(mov.data_movimento).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 capitalize text-xs">
                          {getIcon(mov.tipo)} {mov.tipo.replace('_', ' ')}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate" title={mov.descrizione}>
                        {mov.descrizione}
                      </TableCell>
                      
                      <TableCell>
                        {mov.file_url ? (
                          <a 
                            href={mov.file_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                          >
                            <FileText className="h-4 w-4" />
                            Vedi
                          </a>
                        ) : (
                          <span className="text-zinc-400 text-xs">-</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {mov.note ? (
                          mov.note.includes('⚠️') ? (
                            <Badge 
                              variant="outline" 
                              className="bg-amber-50 text-amber-600 border-amber-200 cursor-help whitespace-nowrap" 
                              title={mov.note}
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Parziale
                            </Badge>
                          ) : mov.note.includes('✅') ? (
                            <Badge 
                              variant="outline" 
                              className="bg-green-50 text-green-600 border-green-200 cursor-help whitespace-nowrap" 
                              title={mov.note}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Verificato
                            </Badge>
                          ) : (
                            <Badge 
                              variant="outline" 
                              className="bg-zinc-50 text-zinc-600 border-zinc-200 cursor-help whitespace-nowrap" 
                              title={mov.note}
                            >
                              <Info className="w-3 h-3 mr-1" />
                              Info
                            </Badge>
                          )
                        ) : (
                          <span className="text-zinc-400 text-xs">-</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-bold text-zinc-900 whitespace-nowrap">
                        € {mov.importo?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}