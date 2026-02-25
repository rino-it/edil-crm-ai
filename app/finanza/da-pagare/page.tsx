import { getScadenzePaginated, getScadenzeKPIs } from '@/utils/data-fetcher'
import { ScadenzeTable } from '@/app/scadenze/components/ScadenzeTable'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingDown, AlertTriangle, Clock, Wallet } from "lucide-react"

export default async function GestioneDebitiPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE

  // Fetch dati: tipo 'uscita'
  const kpis = await getScadenzeKPIs()
  const result = await getScadenzePaginated(
    { tipo: 'uscita', stato: ['da_pagare', 'parziale', 'scaduto'], search: params.search },
    { page, pageSize }
  )

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Header Finanziario */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Gestione Debiti</h1>
        <p className="text-zinc-500">Accounts Payable: monitoraggio e programmazione dei pagamenti ai fornitori.</p>
      </div>

      {/* KPI Gestionali */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-rose-200 bg-rose-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-rose-800 uppercase">Totale Debiti</CardTitle>
            <TrendingDown size={16} className="text-rose-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-black text-rose-900">{formatEuro(kpis.daPagare)}</div></CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-red-800 uppercase">Di cui Scaduti</CardTitle>
            <AlertTriangle size={16} className="text-red-600" />
          </CardHeader>
          <CardContent><div className="text-2xl font-black text-red-900">{formatEuro(kpis.scaduto)}</div></CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-amber-800 uppercase">In Scadenza (7gg)</CardTitle>
            <Clock size={16} className="text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-900">
              {/* TODO: Implementare count in getScadenzeKPIs */}
              ---
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-blue-800 uppercase">Saldo Conti</CardTitle>
            <Wallet size={16} className="text-blue-600" />
          </CardHeader>
          <CardContent>
             {/* Il saldo andrà pescato in un refactor successivo per la pagina programmazione */}
            <div className="text-2xl font-black text-blue-900">---</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabella Paginata */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-zinc-800">Dettaglio Posizioni Aperte (Fornitori)</h2>
        {/* Usiamo la tabella creata in precedenza, che accetta azioni custom */}
        <ScadenzeTable 
          data={result.data} 
          pagination={result} 
          showCantiereColumn={true} 
          showPagamentoActions={true} 
        />
      </div>

    </div>
  )
}