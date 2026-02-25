import { getScadenzePaginated } from '@/utils/data-fetcher'
import { ScadenzeTable } from '../components/ScadenzeTable'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'

export default async function PagatePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE

  // Fetch specifico per archivio: solo pagati
  const result = await getScadenzePaginated(
    { 
      stato: ['pagato'], 
      search: params.search 
    },
    { page, pageSize }
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-zinc-800">Archivio Pagate</h2>
          <p className="text-sm text-zinc-500">Storico delle fatture saldate (ordinato per data di pagamento).</p>
        </div>
      </div>
      
      {/* showPagamentoActions=false perché sono già pagate */}
      <ScadenzeTable 
        data={result.data} 
        pagination={result} 
        showCantiereColumn={true} 
        showPagamentoActions={false} 
      />
    </div>
  )
}