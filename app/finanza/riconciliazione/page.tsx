import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getContiSummary, getStoricoGiroconti } from '@/utils/data-fetcher'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Landmark, ArrowRight, Upload, Plus, AlertCircle } from 'lucide-react'
import { UploadCalendar } from './components/UploadCalendar'
import { AggiungiContoDialog } from './components/AggiungiContoDialog'
import { DocumentiContoDialog } from './components/DocumentiContoDialog'
import { EstrattiContoMeseDialog } from './components/EstrattiContoMeseDialog'
import { GirocontiDialog } from './components/GirocontiDialog'
import { StaggeredGrid } from '@/components/StaggeredGrid'

export const dynamic = 'force-dynamic'

export default async function DashboardRiconciliazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Recupera i dati di tutti i conti (funzione creata nello Step 5.6)
  const conti = await getContiSummary()

  // Calcolo KPI Globali
  const totaleSaldo = conti.reduce((acc, c) => acc + (c.saldo_attuale || 0), 0)
  const totaleDaRiconciliare = conti.reduce((acc, c) => acc + (c.movimenti_da_riconciliare || 0), 0)
  const storicoGiroconti = await getStoricoGiroconti()

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Landmark className="h-8 w-8 text-blue-600" /> Conti e Riconciliazione
          </h1>
          <p className="text-muted-foreground mt-1">Gestisci i conti correnti, carica gli estratti conto e allinea i saldi.</p>
        </div>
        <AggiungiContoDialog />
      </div>

      {/* KPI Globali */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center justify-between gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">Saldo Totale Globale</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-blue-700">{formatEuro(totaleSaldo)}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center justify-between gap-2">
              <div className="h-2 w-2 rounded-full bg-orange-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">Totale Da Riconciliare</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-black text-orange-700">{totaleDaRiconciliare} <span className="text-sm font-medium">mov.</span></div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center justify-between gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex-1">Stato Allineamento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-lg font-bold text-emerald-700">
              {totaleDaRiconciliare === 0 ? 'Tutto Allineato ✅' : 'Allineamento Richiesto ⚠️'}
            </div>
          </CardContent>
        </Card>

        {/* NUOVA CARD GIROCONTI */}
        <GirocontiDialog giroconti={storicoGiroconti} />
      </div>

      {/* Grid Conti Bancari */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">I tuoi Conti Correnti</h2>
        <StaggeredGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conti.map(conto => (
            <Card key={conto.id} className="shadow-[var(--shadow-sm)] border-border/60 card-hover flex flex-col">
              <CardHeader className="pb-2 border-b border-border/40 mb-2">
                <CardTitle className="text-lg font-bold text-foreground truncate" title={conto.nome_conto}>
                  {conto.nome_banca} - <span className="text-muted-foreground font-medium text-sm">{conto.nome_conto}</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground font-mono tracking-wider">{conto.iban || 'IBAN non inserito'}</p>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 pt-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Saldo Attuale</p>
                  <p className="text-2xl font-black text-foreground">{formatEuro(conto.saldo_attuale)}</p>
                </div>
                
                {conto.movimenti_da_riconciliare > 0 ? (
                  <div className="bg-orange-50 text-orange-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 border border-orange-200/50">
                    <AlertCircle size={14} /> {conto.movimenti_da_riconciliare} movimenti da sistemare
                  </div>
                ) : (
                  <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 border border-emerald-200/50">
                    Nessun movimento arretrato
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex gap-2 pt-4 mt-auto border-t border-border/40">
                <Link href={`/finanza/riconciliazione/${conto.id}`} className="flex-1">
                  <Button variant="outline" className="w-full hover:bg-muted/50">
                    Apri Riconciliazione <ArrowRight size={14} className="ml-2" />
                  </Button>
                </Link>
                <DocumentiContoDialog 
                  contoId={conto.id} 
                  nomeBanca={conto.nome_banca} 
                />
              </CardFooter>
            </Card>
          ))}
        </StaggeredGrid>
      </div>

      {/* Archivio Upload Mensili Dinamico per ogni conto */}
      <div className="pt-8">
        <h2 className="text-xl font-bold text-foreground mb-4">Archivio Estratti Conto 2026</h2>
        
        <Card className="shadow-[var(--shadow-sm)] border-border/60 space-y-8 p-6">
          {conti.length === 0 ? (
            <p className="text-muted-foreground italic text-sm">Aggiungi un conto corrente per visualizzare i calendari.</p>
          ) : (
            conti.map(conto => (
              <div key={`calendar-${conto.id}`}>
                <div className="flex justify-between items-center border-b border-border/40 pb-2">
                  <h3 className="font-bold text-foreground">{conto.nome_banca} - {conto.nome_conto}</h3>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2 mt-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((meseNum) => (
                    <EstrattiContoMeseDialog 
                      key={meseNum}
                      contoId={conto.id} 
                      anno={2026} 
                      meseNum={meseNum} 
                      haEstratto={false} // La logica per verificare se è stato caricato andrà aggiunta qui in futuro
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

    </div>
    </div>
  )
}