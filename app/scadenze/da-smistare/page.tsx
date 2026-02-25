import { getScadenzePaginated } from '@/utils/data-fetcher'
import { ScadenzeTable } from '../components/ScadenzeTable'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'

export default async function DaSmistarePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE

  // Fetch specifico: cantiere_id passato come `null` esplicito per forzare la query `IS NULL`
  const result = await getScadenzePaginated(
    { 
      stato: ['da_pagare', 'parziale'], 
      cantiere_id: null,
      search: params.search 
    },
    { page, pageSize }
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-zinc-800">Da Smistare (Senza Cantiere)</h2>
          <p className="text-sm text-zinc-500">Fatture attive che non sono state ancora assegnate a un cantiere.</p>
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