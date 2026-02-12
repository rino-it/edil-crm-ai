import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table" // Assicurati di avere npx shadcn@latest add table
import { ArrowLeft, Wallet, TrendingDown, Hammer, FileText, Clock, ShoppingCart } from "lucide-react"

export default async function CantierePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Dati Cantiere
  const { data: cantiere, error: cantiereError } = await supabase
    .from('cantieri')
    .select('*')
    .eq('id', id)
    .single()

  if (cantiereError || !cantiere) notFound()

  // Lista Movimenti
  const { data: movimenti } = await supabase
    .from('movimenti')
    .select('*')
    .eq('cantiere_id', id)
    .order('data_movimento', { ascending: false })

  // Calcoli
  const totaleSpeso = movimenti?.reduce((acc, mov) => acc + (mov.importo || 0), 0) || 0
  const budget = cantiere.budget || 0
  const rimanente = budget - totaleSpeso
  const percentualeSpesa = budget > 0 ? (totaleSpeso / budget) * 100 : 0

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
          <div className="flex gap-2">
             <Link href={`/cantieri/${id}/spesa`}>
               <Button>+ Nuova Spesa / DDT</Button>
             </Link>
          </div>
        </div>

        {/* KPIs Finanziari */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Budget Totale</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€ {budget.toLocaleString('it-IT')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speso ad oggi</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">€ {totaleSpeso.toLocaleString('it-IT')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Margine</CardTitle>
              <Hammer className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${rimanente < 0 ? 'text-red-600' : 'text-green-600'}`}>
                € {rimanente.toLocaleString('it-IT')}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabella Movimenti */}
        <Card>
          <CardHeader>
            <CardTitle>Storico Movimenti</CardTitle>
          </CardHeader>
          <CardContent>
            {(!movimenti || movimenti.length === 0) ? (
              <div className="text-center py-10 text-muted-foreground">Nessuna spesa registrata.</div>
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
                      <TableCell>{new Date(mov.data_movimento).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 capitalize">
                          {getIcon(mov.tipo)} {mov.tipo}
                        </div>
                      </TableCell>
                      <TableCell>{mov.descrizione}</TableCell>
                      <TableCell className="text-right font-medium">
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