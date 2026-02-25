'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, TrendingUp, Wallet, ArrowRight } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { getCashflowProjection, CashflowProjection } from '@/utils/data-fetcher'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function ProgrammazionePage() {
  const [data, setData] = useState<CashflowProjection | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Essendo un client component con dati complessi, facciamo fetch dal client o passiamo tramite un server component wrapper.
    // Per velocità lo chiamiamo direttamente qui (in Next.js i Server Actions/Fetcher possono essere chiamati dal client)
    getCashflowProjection(90).then(res => {
      setData(res);
      setIsLoading(false);
    });
  }, []);

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  if (isLoading) return <div className="p-8 text-center text-zinc-500 animate-pulse">Analisi proiezioni di cassa in corso...</div>;
  if (!data) return null;

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
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900">
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

      {/* Grafico Recharts */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Andamento Liquidità (90 giorni)</CardTitle>
          <CardDescription>Barre = Flussi in/out settimanali | Linea = Saldo progressivo stimato</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.weeks} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="weekLabel" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} dy={10} />
              <YAxis yAxisId="left" tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} />
              <Tooltip formatter={(value) => formatEuro(Number(value ?? 0))} labelClassName="font-bold text-zinc-900" />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              <Bar yAxisId="left" dataKey="entrate" name="Entrate Previste" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="left" dataKey="uscite" name="Uscite Previste" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Line yAxisId="right" type="monotone" dataKey="saldoPrevisto" name="Saldo Cassa" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: 'white' }} />
            </ComposedChart>
          </ResponsiveContainer>
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
              {data.weeks.map((w, i) => {
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