import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getContiSummary } from '@/utils/data-fetcher'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Landmark, ArrowRight, Upload, Plus, AlertCircle } from 'lucide-react'
import { UploadCalendar } from './components/UploadCalendar'
import { AggiungiContoDialog } from './components/AggiungiContoDialog'
import { DocumentiContoDialog } from './components/DocumentiContoDialog'
import { EstrattiContoMeseDialog } from './components/EstrattiContoMeseDialog'

export const dynamic = 'force-dynamic'

export default async function DashboardRiconciliazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Recupera i dati di tutti i conti (funzione creata nello Step 5.6)
  const conti = await getContiSummary()

  // Calcolo KPI Globali
  const totaleSaldo = conti.reduce((acc, c) => acc + (c.saldo_attuale || 0), 0)
  const totaleDaRiconciliare = conti.reduce((acc, c) => acc + (c.movimenti_da_riconciliare || 0), 0)

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
            <Landmark className="h-8 w-8 text-blue-600" /> Conti e Riconciliazione
          </h1>
          <p className="text-zinc-500 mt-1">Gestisci i conti correnti, carica gli estratti conto e allinea i saldi.</p>
        </div>
        <AggiungiContoDialog />
      </div>

      {/* KPI Globali */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-blue-800 uppercase">Saldo Totale Globale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-900">{formatEuro(totaleSaldo)}</div>
          </CardContent>
        </Card>
        
        <Card className="border-orange-200 bg-orange-50/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-orange-800 uppercase">Totale Da Riconciliare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-orange-900">{totaleDaRiconciliare} <span className="text-sm font-medium">mov.</span></div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-emerald-800 uppercase">Stato Allineamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-900 mt-1">
              {totaleDaRiconciliare === 0 ? 'Tutto Allineato ✅' : 'Allineamento Richiesto ⚠️'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid Conti Bancari */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-zinc-800">I tuoi Conti Correnti</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conti.map(conto => (
            <Card key={conto.id} className="hover:shadow-md transition-shadow bg-white flex flex-col">
              <CardHeader className="pb-2 border-b border-zinc-100 mb-2">
                <CardTitle className="text-lg font-bold text-zinc-900 truncate" title={conto.nome_conto}>
                  {conto.nome_banca} - <span className="text-zinc-500 font-medium text-sm">{conto.nome_conto}</span>
                </CardTitle>
                <p className="text-xs text-zinc-500 font-mono tracking-wider">{conto.iban || 'IBAN non inserito'}</p>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                <div>
                  <p className="text-xs font-bold text-zinc-500 uppercase">Saldo Attuale</p>
                  <p className="text-2xl font-black text-zinc-900">{formatEuro(conto.saldo_attuale)}</p>
                </div>
                
                {conto.movimenti_da_riconciliare > 0 ? (
                  <div className="bg-orange-50 text-orange-700 text-xs font-bold px-3 py-2 rounded-md flex items-center gap-2">
                    <AlertCircle size={14} /> {conto.movimenti_da_riconciliare} movimenti da sistemare
                  </div>
                ) : (
                  <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2 rounded-md flex items-center gap-2">
                    Nessun movimento arretrato
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2 pt-0 mt-auto">
                <Link href={`/finanza/riconciliazione/${conto.id}`} className="flex-1">
                  <Button variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50">
                    Apri Riconciliazione <ArrowRight size={14} className="ml-2" />
                  </Button>
                </Link>
                <DocumentiContoDialog 
                  contoId={conto.id} 
                  nomeBanca={conto.nome_banca} 
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* Archivio Upload Mensili - Placeholder per Step 5.4 */}
      <div className="pt-8">
        <h2 className="text-xl font-bold text-zinc-800 mb-4">Archivio Upload 2026</h2>
        {/* Esempio statico, puoi renderlo dinamico iterando sui conti */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
          <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
            <h3 className="font-bold text-zinc-700">Situazione Globale</h3>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2 mt-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((meseNum) => (
              <EstrattiContoMeseDialog 
                key={meseNum}
                contoId={conti[0]?.id || ''} 
                anno={2026} 
                meseNum={meseNum} 
                haEstratto={false}
              />
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}