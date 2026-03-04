import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMovimentiPaginati, getScadenzeApertePerMatch, getSpeseBancarieConto, getCostiRicorrentiConto, getGirocontiVersoCartaConto } from '@/utils/data-fetcher'
import ClientRiconciliazione from '../ClientRiconciliazione'
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Landmark, CreditCard, ArrowDownCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { SpeseBancarieSection } from '../components/SpeseBancarieSection'
import { CostiRicorrentiSection } from '../components/CostiRicorrentiSection'

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

  // Anno per le spese bancarie (default: anno corrente)
  const annoCorrente = new Date().getFullYear()
  const annoSpese = anno || annoCorrente
  const anniDisponibili = [annoCorrente, annoCorrente - 1, annoCorrente - 2]

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

  // 4. Fetch Spese Bancarie per questo conto
  const speseMensili = await getSpeseBancarieConto(contoId, annoSpese)

  // 5. Fetch Costi Ricorrenti (Leasing, Assicurazione, Mutuo, Interessi)
  const costiRicorrenti = await getCostiRicorrentiConto(contoId, annoSpese)

  // 6. Fetch Giroconti ricevuti (solo per carte credito/prepagate)
  const isCartaConto = conto.tipo_conto === 'credito' || conto.tipo_conto === 'prepagata'
  const girocontiRicevuti = isCartaConto ? await getGirocontiVersoCartaConto(contoId) : []

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

      {/* Sezione Spese e Commissioni Bancarie */}
      <SpeseBancarieSection
        speseMensili={speseMensili}
        annoSelezionato={annoSpese}
        anni={anniDisponibili}
      />

      {/* Sezione Costi Ricorrenti */}
      <CostiRicorrentiSection
        costiMensili={costiRicorrenti}
        annoSelezionato={annoSpese}
        anni={anniDisponibili}
      />

      {/* Sezione Ricariche / Addebiti Ricevuti (solo per carte credito e prepagate) */}
      {isCartaConto && (
        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-3">
              <ArrowDownCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              <CardTitle className="text-base font-bold text-foreground">Ricariche e Addebiti Ricevuti</CardTitle>
              <Badge variant="outline" className="text-[10px] h-5 border-none bg-zinc-100 text-zinc-600">
                {girocontiRicevuti.length} movimento{girocontiRicevuti.length !== 1 ? 'i' : ''}
              </Badge>
            </div>
            <CardDescription className="mt-1 text-xs">
              Giroconti e ricariche provenienti dagli altri conti verso questa carta, già riconciliati.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {girocontiRicevuti.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nessuna ricarica ricevuta trovata. I movimenti appariranno qui dopo la riconciliazione del conto di addebito.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Da (conto origine)</TableHead>
                    <TableHead>Causale</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {girocontiRicevuti.map((g: any) => (
                    <TableRow key={g.id} className="hover:bg-emerald-50/30">
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(g.data_operazione).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
                          {g.conti_banca?.nome_banca}{g.conti_banca?.nome_conto ? ` — ${g.conti_banca.nome_conto}` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[300px] truncate" title={g.descrizione}>
                        {g.descrizione}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 whitespace-nowrap">
                        {formatEuro(Math.abs(g.importo))}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 italic max-w-[200px] truncate" title={g.note_riconciliazione || ''}>
                        {g.note_riconciliazione || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      
    </div>
  )
}