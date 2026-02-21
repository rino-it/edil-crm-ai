import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getMovimentiNonRiconciliati, getScadenzeApertePerMatch } from '@/utils/data-fetcher'
import ClientRiconciliazione from './ClientRiconciliazione'

export const dynamic = 'force-dynamic'

export default async function RiconciliazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Scarica i dati freschi dal DB
  const movimenti = await getMovimentiNonRiconciliati()
  const scadenzeEntrata = await getScadenzeApertePerMatch('entrata')
  const scadenzeUscita = await getScadenzeApertePerMatch('uscita')
  
  // Uniamo tutte le scadenze per la tendina della ricerca manuale
  const scadenzeAperte = [...scadenzeEntrata, ...scadenzeUscita]

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Riconciliazione Bancaria AI</h1>
          <p className="text-zinc-500 mt-1">Carica l'estratto conto CSV e lascia che l'Intelligenza Artificiale trovi le fatture corrispondenti.</p>
        </div>
        
        <ClientRiconciliazione 
          movimenti={movimenti} 
          scadenzeAperte={scadenzeAperte} 
        />
      </div>
    </div>
  )
}