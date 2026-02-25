import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMovimentiPaginati, getScadenzeApertePerMatch } from '@/utils/data-fetcher'
import ClientRiconciliazione from '../ClientRiconciliazione'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Landmark } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DettaglioContoPage({
  params,
  searchParams,
}: {
  params: Promise<{ contoId: string }>
  searchParams: Promise<{ page?: string; pageSize?: string; mese?: string; anno?: string; search?: string; stato?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Risoluzione dei parametri (Next.js 15+ richiede await su params/searchParams)
  const resolvedParams = await params
  const contoId = resolvedParams.contoId

  const resolvedSearchParams = await searchParams
  const page = Number(resolvedSearchParams.page) || 1
  const pageSize = Number(resolvedSearchParams.pageSize) || DEFAULT_PAGE_SIZE
  const mese = resolvedSearchParams.mese ? Number(resolvedSearchParams.mese) : undefined
  const anno = resolvedSearchParams.anno ? Number(resolvedSearchParams.anno) : undefined
  const search = resolvedSearchParams.search
  
  // Di default mostriamo solo quelli da riconciliare, ma l'utente potrà cambiare il filtro
  const stato = resolvedSearchParams.stato || 'non_riconciliato' 

  // 1. Recupero Dettagli del singolo Conto
  const { data: conto, error: errConto } = await supabase
    .from('conti_banca')
    .select('*')
    .eq('id', contoId)
    .single()

  if (errConto || !conto) {
    redirect('/finanza/riconciliazione')
  }

  // 2. Fetch Paginato dei Movimenti
  const result = await getMovimentiPaginati(
    contoId,
    { page, pageSize },
    { mese, anno, search, stato }
  )

  // 3. Fetch delle Scadenze (Entrate + Uscite) per il matching AI manuale
  const scadenzeEntrata = await getScadenzeApertePerMatch('entrata')
  const scadenzeUscita = await getScadenzeApertePerMatch('uscita')
  const scadenzeAperte = [...scadenzeEntrata, ...scadenzeUscita]

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Header Navigazione e Info Conto */}
      <div className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        <Link href="/finanza/riconciliazione">
          <Button variant="outline" size="icon" className="h-10 w-10 text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={18} />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
            <Landmark className="h-7 w-7 text-blue-600" />
            {conto.nome_banca} - {conto.nome_conto}
          </h1>
          <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
            IBAN: <span className="font-mono text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded">{conto.iban || 'N/D'}</span>
            <span className="text-zinc-300">|</span>
            Saldo attuale: <strong className="text-zinc-900">{formatEuro(conto.saldo_attuale || 0)}</strong>
          </p>
        </div>
      </div>

      {/* Area Riconciliazione (Client Component) */}
      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
        {/* Passiamo il contoId per legare gli upload e i risultati paginati */}
        <ClientRiconciliazione 
          contoId={contoId}
          movimenti={result.data}
          scadenzeAperte={scadenzeAperte}
          pagination={result} 
        />
      </div>
      
    </div>
  )
}