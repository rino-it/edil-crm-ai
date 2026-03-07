import { getScadenzePaginated, getCantieriAttivi } from '@/utils/data-fetcher'
import { ScadenzeTable } from '../components/ScadenzeTable'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'

export default async function DaPagarePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = Number(params.pageSize) || DEFAULT_PAGE_SIZE

  // Fetch parallelo: scadenze + cantieri per dropdown inline
  const [result, cantieriRaw] = await Promise.all([
    getScadenzePaginated(
      { 
        tipo: 'uscita', 
        stato: ['da_pagare', 'parziale', 'scaduto'], 
        scadenzaEntroGiorni: 30,
        search: params.search 
      },
      { page, pageSize }
    ),
    getCantieriAttivi(),
  ])

  const cantieri = cantieriRaw.map(c => ({ id: c.id, label: c.nome }))

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-zinc-800">Uscite da Pagare</h2>
          <p className="text-sm text-zinc-500">Fatture scadute e in scadenza nei prossimi 30 giorni.</p>
        </div>
      </div>
      
      <ScadenzeTable 
        data={result.data} 
        pagination={result} 
        showCantiereColumn={true} 
        showPagamentoActions={true}
        cantieri={cantieri}
      />
    </div>
  )
}