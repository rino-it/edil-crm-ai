import { getScadenzePaginated, getScadenzeKPIs } from '@/utils/data-fetcher'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, TrendingDown, TrendingUp, ClockAlert } from "lucide-react"
import Link from "next/link"
import { ScadutiTable } from './ScadutiTable'

export default async function GestioneScadutiPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; tab?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE
  const currentTab = params.tab || 'crediti'

  const kpis = await getScadenzeKPIs()
  const result = await getScadenzePaginated(
    { 
      tipo: currentTab === 'crediti' ? 'entrata' : 'uscita', 
      stato: ['scaduto'], 
      search: params.search 
    },
    { page, pageSize }
  )

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-red-900 flex items-center gap-2">
          <ClockAlert className="h-8 w-8 text-red-600" />
          Aging & Scaduti
        </h1>
        <p className="text-zinc-500 mt-1">Escalation solleciti e recupero delle posizioni in ritardo strutturate per gravità.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-red-800 uppercase">Totale Insoluti (Generale)</CardTitle>
            <AlertTriangle size={16} className="text-red-600" />
          </CardHeader>
          <CardContent><div className="text-3xl font-black text-red-900">{formatEuro(kpis.scaduto)}</div></CardContent>
        </Card>
      </div>

      <div className="flex space-x-1 border-b border-zinc-200">
        <Link
          href="?tab=crediti"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${currentTab === 'crediti' ? 'border-red-600 text-red-700' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}`}
        >
          <TrendingUp size={16} /> Crediti vs Clienti (Da sollecitare)
        </Link>
        <Link
          href="?tab=debiti"
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${currentTab === 'debiti' ? 'border-orange-600 text-orange-700' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}`}
        >
          <TrendingDown size={16} /> Debiti vs Fornitori (Da pagare)
        </Link>
      </div>

      <div className="space-y-4">
        <ScadutiTable 
          data={result.data} 
          pagination={result} 
          tipo={currentTab as 'crediti' | 'debiti'} 
        />
      </div>

    </div>
  )
}