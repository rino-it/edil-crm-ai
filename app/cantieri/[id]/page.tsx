import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Wallet, TrendingDown, Hammer, FileText, Clock, ShoppingCart, ListChecks, User, HardHat } from "lucide-react"

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
  // Questa è la parte che mancava per vedere le righe singole
  const { data: presenze } = await supabase
    .from('presenze')
    .select('*, personale(nome, ruolo)')
    .eq('cantiere_id', id)
    .order('data', { ascending: false })

  // 4. CALCOLI UNIFICATI
  const totaleMateriali = movimenti?.reduce((acc, mov) => acc + (mov.importo || 0), 0) || 0
  
  // Somma costo manodopera
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totaleManodopera = presenze?.reduce((acc, p: any) => acc + (p.costo_calcolato || 0), 0) || 0

  const totaleSpeso = totaleMateriali + totaleManodopera
  
  // Usiamo 'budget' (31k) come confermato dal tuo CSV, non 'budget_totale'
  const budget = cantiere.budget || 0 
  const rimanente = budget - totaleSpeso
  const percentualeSpesa = budget > 0 ? (totaleSpeso / budget) * 100 : 0

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

        {/* KPIs Finanziari Aggiornati (Separati per Materiali e Manodopera) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card shadow-sm className="md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Budget Totale</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€ {budget.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <div className="mt-2 h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${percentualeSpesa > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(percentualeSpesa, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
          
          <Card shadow-sm>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Spesa Materiali</CardTitle>
              <ShoppingCart className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-700">€ {totaleMateriali.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">DDT e Fatture</p>
            </CardContent>
          </Card>

          <Card shadow-sm>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Spesa Manodopera</CardTitle>
              <HardHat className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-700">€ {totaleManodopera.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">Ore lavorate</p>
            </CardContent>
          </Card>
          
          <Card shadow-sm>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Margine Rimanente</CardTitle>
              <Hammer className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${rimanente < 0 ? 'text-red-600' : 'text-green-600'}`}>
                € {rimanente.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Totale speso: {percentualeSpesa.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* NUOVA SEZIONE: Tabella Presenze Singole */}
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

        {/* Sezione Movimenti / Materiali (esistente) */}
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
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimenti.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium">
                        {new Date(mov.data_movimento).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 capitalize text-xs">
                          {getIcon(mov.tipo)} {mov.tipo.replace('_', ' ')}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{mov.descrizione}</TableCell>
                      <TableCell className="text-right font-bold text-zinc-900">
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