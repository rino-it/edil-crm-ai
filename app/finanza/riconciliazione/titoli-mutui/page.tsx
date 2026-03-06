import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMutuiConRate, getRateMutuo, getTitoli, getContiBanca } from '@/utils/data-fetcher'
import { Landmark, Receipt, ArrowLeft } from 'lucide-react'
import { CreaMutuoDialog } from './components/CreaMutuoDialog'
import { CreaTitoloDialog } from './components/CreaTitoloDialog'
import { MutuiSection } from './components/MutuiSection'
import { TitoliSection } from './components/TitoliSection'

export const dynamic = 'force-dynamic'

export default async function TitoliMutuiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch dati in parallelo
  const [mutui, titoli, conti, soggettiRaw] = await Promise.all([
    getMutuiConRate(),
    getTitoli(),
    getContiBanca(),
    supabase.from('anagrafica_soggetti').select('id, ragione_sociale').order('ragione_sociale').then(r => r.data || []),
  ])

  // Fetch rate per ogni mutuo (parallelo)
  const ratePerMutuo: Record<string, any[]> = {}
  await Promise.all(
    mutui.map(async (m) => {
      ratePerMutuo[m.id] = await getRateMutuo(m.id)
    })
  )

  const soggetti = soggettiRaw as { id: string; ragione_sociale: string }[]

  return (
    <div className="animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link href="/finanza/riconciliazione" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft size={12} /> Conti e Riconciliazione
            </Link>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Landmark className="h-8 w-8 text-blue-600" /> Gestione Titoli e Mutui
            </h1>
            <p className="text-muted-foreground mt-1">Mutui, finanziamenti, assegni e cambiali in un&apos;unica vista.</p>
          </div>
          <div className="flex gap-2">
            <CreaMutuoDialog conti={conti.map(c => ({ id: c.id, nome_banca: c.nome_banca, nome_conto: c.nome_conto }))} />
            <CreaTitoloDialog soggetti={soggetti} />
          </div>
        </div>

        {/* Sezione Mutui */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-bold text-foreground">Mutui e Finanziamenti</h2>
            <span className="text-xs text-muted-foreground">({mutui.length})</span>
          </div>
          <MutuiSection mutui={mutui} ratePerMutuo={ratePerMutuo} />
        </section>

        {/* Separatore */}
        <hr className="border-border/40" />

        {/* Sezione Titoli */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-foreground">Assegni e Cambiali</h2>
            <span className="text-xs text-muted-foreground">({titoli.length})</span>
          </div>
          <TitoliSection titoli={titoli} />
        </section>

      </div>
    </div>
  )
}
