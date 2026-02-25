import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, TrendingUp, Wallet } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCashflowProjection } from '@/utils/data-fetcher'
import ProgrammazioneChart from './ProgrammazioneChart'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProgrammazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // FETCH SUL SERVER: Sicuro, usa l'admin key, nessun errore "supabaseKey is required"
  // Aspettiamo i dati prima ancora di inviare l'HTML al browser. Addio caricamento infinito!
  const data = await getCashflowProjection(90)

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  if (!data) return <div className="p-8 text-center text-zinc-500">Errore nel caricamento dei dati.</div>

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
          <TrendingUp className="h-8 w-8 text-blue-600" />
          Programmazione Cashflow
        </h1>
        <p className="text-zinc-500 mt-1">Proiezione della liquidità a 90 giorni basata sulle scadenze correnti.</p>
      </div>

      {/* Alert Liquidità Negativa */}
      {data.hasNegativeWeeks && (
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900 shadow-sm">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-bold text-lg">Attenzione: Rischio Liquidità</AlertTitle>
          <AlertDescription className="mt-1">
            Il sistema ha rilevato settimane future in cui le uscite programmate supereranno la liquidità disponibile. 
            Controlla il grafico sottostante e anticipa gli incassi o ritarda i pagamenti.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Attuale */}
      <Card className="bg-zinc-900 text-white shadow-xl border-none">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-1">Saldo Liquidità Iniziale (Oggi)</p>
            <div className="text-4xl font-black">{formatEuro(data.saldoAttuale)}</div>
          </div>
          <Wallet className="h-12 w-12 text-zinc-700 opacity-50" />
        </CardContent>
      </Card>

      {/* Grafico Recharts (Incapsulato nel Client Component) */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Andamento Liquidità (90 giorni)</CardTitle>
          <CardDescription>Barre = Flussi in/out settimanali | Linea = Saldo progressivo stimato</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px]">
          <ProgrammazioneChart data={data.weeks} />
        </CardContent>
      </Card>

      {/* Tabella Dettaglio Settimanale */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Dettaglio Numerico</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-zinc-50">
              <TableRow>
                <TableHead>Settimana</TableHead>
                <TableHead className="text-right">Entrate Previste</TableHead>
                <TableHead className="text-right">Uscite Previste</TableHead>
                <TableHead className="text-right">Saldo Netto Periodo</TableHead>
                <TableHead className="text-right font-bold">Liquidità Finale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.weeks.map((w: any, i: number) => {
                const netto = w.entrate - w.uscite;
                return (
                  <TableRow key={i} className="hover:bg-zinc-50/50">
                    <TableCell className="font-medium text-sm">{w.weekLabel}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-mono">{formatEuro(w.entrate)}</TableCell>
                    <TableCell className="text-right text-rose-600 font-mono">{formatEuro(w.uscite)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${netto > 0 ? 'text-emerald-600' : netto < 0 ? 'text-rose-600' : 'text-zinc-400'}`}>
                      {netto > 0 ? '+' : ''}{formatEuro(netto)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-black text-lg ${w.saldoPrevisto < 0 ? 'text-red-600 bg-red-50' : 'text-blue-900'}`}>
                      {formatEuro(w.saldoPrevisto)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  )
}