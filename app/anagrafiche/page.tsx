import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getAnagrafichePaginate, getKPIAnagrafiche } from '@/utils/data-fetcher'
import { addSoggetto } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { DEFAULT_PAGE_SIZE } from '@/types/pagination'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { Building2, Users, Wallet, TrendingDown, Plus, Search, Mail, Phone, ExternalLink } from "lucide-react"
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AnagrafichePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; error?: string; nuovo?: string; page?: string; search?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const resolvedParams = await searchParams
  const tipo = resolvedParams.tipo
  const error = resolvedParams.error
  const nuovo = resolvedParams.nuovo
  const page = Number(resolvedParams.page) || 1
  const search = resolvedParams.search || ''

  // Caricamento dati con Paginazione e Ricerca
  const result = await getAnagrafichePaginate(
    { page, pageSize: DEFAULT_PAGE_SIZE },
    search,
    tipo
  )
  const kpis = await getKPIAnagrafiche()

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-600" /> Anagrafiche
            </h1>
            <p className="text-muted-foreground">Gestione centralizzata fornitori e clienti dell'azienda.</p>
          </div>
          
          {!nuovo ? (
            <Link href="/anagrafiche?nuovo=true">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" /> Nuovo Soggetto
              </Button>
            </Link>
          ) : (
            <Link href="/anagrafiche">
              <Button variant="outline">Annulla Creazione</Button>
            </Link>
          )}
        </div>

        {/* Banner Errore */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Sezione Creazione Inline */}
        {nuovo && (
          <Card className="border-blue-200 bg-blue-50/30 shadow-sm animate-in slide-in-from-top duration-300 shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-foreground">Aggiungi Nuovo Soggetto</CardTitle>
              <CardDescription>Inserisci i dati anagrafici del cliente o fornitore.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form action={addSoggetto} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipo" className="text-zinc-700">Tipo Soggetto</Label>
                    <select 
                      name="tipo" 
                      id="tipo" 
                      required
                      className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="fornitore">Fornitore</option>
                      <option value="cliente">Cliente</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="ragione_sociale">Ragione Sociale *</Label>
                    <Input name="ragione_sociale" id="ragione_sociale" placeholder="Es: Rossi Srl" required className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partita_iva">Partita IVA</Label>
                    <Input name="partita_iva" id="partita_iva" placeholder="11 cifre" className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codice_fiscale">Codice Fiscale</Label>
                    <Input name="codice_fiscale" id="codice_fiscale" placeholder="16 caratteri" className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codice_sdi">Codice SDI</Label>
                    <Input name="codice_sdi" id="codice_sdi" placeholder="0000000" className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input name="email" id="email" type="email" placeholder="info@azienda.it" className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefono">Telefono</Label>
                    <Input name="telefono" id="telefono" placeholder="+39..." className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="indirizzo">Indirizzo Sede Legale</Label>
                    <Input name="indirizzo" id="indirizzo" placeholder="Via, civico, CAP, Città" className="hover:border-ring/50 focus-visible:ring-2" />
                  </div>
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <Link href="/anagrafiche">
                    <Button type="button" variant="outline">Annulla</Button>
                  </Link>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Salva Anagrafica</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Fornitori</CardTitle>
              </div>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className="text-lg md:text-2xl font-black text-orange-700">{kpis.fornitori}</div>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Clienti</CardTitle>
              </div>
              <Users className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className="text-lg md:text-2xl font-black text-emerald-700">{kpis.clienti}</div>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Crediti Aperti</CardTitle>
              </div>
              <TrendingDown className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className="text-lg md:text-2xl font-black text-indigo-700">{formatEuro(kpis.totale_crediti)}</div>
            </CardContent>
          </Card>
          <Card className="shadow-[var(--shadow-sm)] border-border/60">
            <CardHeader className="pb-1 md:pb-2 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Debiti Aperti</CardTitle>
              </div>
              <Wallet className="h-4 w-4 text-rose-600" />
            </CardHeader>
            <CardContent className="pt-3 md:pt-4">
              <div className="text-lg md:text-2xl font-black text-rose-700">{formatEuro(kpis.totale_debiti)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtri e Tabella */}
        <Card className="shadow-sm border-zinc-200 bg-white">
          <CardHeader className="border-b border-zinc-100 p-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex bg-zinc-100 p-1 rounded-lg w-full md:w-auto">
                <Link href="/anagrafiche" className={`flex-1 md:flex-none text-center px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${!tipo ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Tutti</Link>
                <Link href="/anagrafiche?tipo=fornitore" className={`flex-1 md:flex-none text-center px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${tipo === 'fornitore' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Fornitori</Link>
                <Link href="/anagrafiche?tipo=cliente" className={`flex-1 md:flex-none text-center px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${tipo === 'cliente' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Clienti</Link>
              </div>
              
              {/* Motore di Ricerca Server-Side */}
              <form action="/anagrafiche" method="GET" className="flex items-center gap-2 w-full md:w-80">
                {tipo && <input type="hidden" name="tipo" value={tipo} />}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input 
                    name="search" 
                    defaultValue={search} 
                    placeholder="Cerca Ragione Sociale o P.IVA..." 
                    className="pl-9 bg-zinc-50 border-zinc-200" 
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm" className="h-10">Cerca</Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-zinc-50/50">
                  <TableRow>
                    <TableHead className="w-[30%]">Ragione Sociale</TableHead>
                    <TableHead>Identificativo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Contatti</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-zinc-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Building2 className="h-8 w-8 text-zinc-300" />
                          <p className="italic">Nessun soggetto trovato.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    result.data.map((s) => (
                      <TableRow key={s.id} className="hover:bg-zinc-50/80 group transition-colors">
                        <TableCell className="font-bold text-zinc-900">
                          <Link href={`/anagrafiche/${s.id}`} className="hover:text-blue-600 transition-colors">
                            {s.ragione_sociale}
                          </Link>
                        </TableCell>
                        <TableCell className="text-zinc-500 font-mono text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span>PIVA: {s.partita_iva || '-'}</span>
                            <span>CF: {s.codice_fiscale || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={s.tipo === 'cliente' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}>
                            {s.tipo?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-500 text-xs">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1.5"><Mail size={12} className="text-zinc-400" /> {s.email || '-'}</span>
                            <span className="flex items-center gap-1.5"><Phone size={12} className="text-zinc-400" /> {s.telefono || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/anagrafiche/${s.id}`}>
                            <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors">
                              <ExternalLink size={14} className="mr-1.5" /> Dettaglio
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden divide-y divide-zinc-100">
              {result.data.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Building2 className="h-8 w-8 text-zinc-300" />
                    <p className="italic">Nessun soggetto trovato.</p>
                  </div>
                </div>
              ) : (
                result.data.map((s) => (
                  <div key={s.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/anagrafiche/${s.id}`} className="font-bold text-zinc-900 hover:text-blue-600 transition-colors line-clamp-2">
                          {s.ragione_sociale}
                        </Link>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${s.tipo === 'cliente' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                        {s.tipo?.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-xs text-zinc-500 font-mono bg-zinc-50 rounded-lg border border-zinc-100 p-2">
                      <div>PIVA: {s.partita_iva || '-'}</div>
                      <div>CF: {s.codice_fiscale || '-'}</div>
                    </div>

                    <div className="text-xs text-zinc-500 space-y-1">
                      <div className="flex items-center gap-1.5"><Mail size={12} className="text-zinc-400" /> {s.email || '-'}</div>
                      <div className="flex items-center gap-1.5"><Phone size={12} className="text-zinc-400" /> {s.telefono || '-'}</div>
                    </div>

                    <div className="flex justify-end">
                      <Link href={`/anagrafiche/${s.id}`}>
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors">
                          <ExternalLink size={14} className="mr-1.5" /> Dettaglio
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Controlli Paginazione */}
            <div className="p-4 border-t border-zinc-100 bg-zinc-50/30">
              <PaginationControls 
                totalCount={result.totalCount}
                currentPage={result.page}
                pageSize={result.pageSize}
                totalPages={result.totalPages}
                searchParams={{ tipo, search }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AlertCircle(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  )
}