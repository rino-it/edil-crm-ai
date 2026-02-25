import { getScadenzePaginated } from '@/utils/data-fetcher'
import { ScadenzeTable } from '../components/ScadenzeTable'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'

export default async function ScadutePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE

  // Fetch specifico per "Scaduto" (Sia entrate che uscite)
  const result = await getScadenzePaginated(
    { 
      stato: ['scaduto'], 
      search: params.search 
    },
    { page, pageSize }
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-rose-800">Scadenze Superate</h2>
          <p className="text-sm text-zinc-500">Tutti i pagamenti e incassi oltre la data limite.</p>
        </div>
      </div>
      
      <ScadenzeTable 
        data={result.data} 
        pagination={result} 
        showCantiereColumn={true} 
        showPagamentoActions={true} 
      />
    </div>
  )
}