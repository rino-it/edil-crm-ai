import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getSoggetti, getKPIAnagrafiche } from '@/utils/data-fetcher'
import { addSoggetto } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Building2, Users, Wallet, TrendingDown, Plus, Search, Mail, Phone, ExternalLink } from "lucide-react"
import Link from 'next/link'

export default async function AnagrafichePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; error?: string; nuovo?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tipo, error, nuovo } = await searchParams
  const soggetti = await getSoggetti(tipo)
  const kpis = await getKPIAnagrafiche()

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-600" /> Anagrafiche
            </h1>
            <p className="text-zinc-500">Gestione centralizzata fornitori e clienti dell'azienda.</p>
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

        {/* Sezione Creazione Inline (visibile solo se URL ha ?nuovo=true) */}
        {nuovo && (
          <Card className="border-blue-200 bg-blue-50/30 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-blue-800">Aggiungi Nuovo Soggetto</CardTitle>
              <CardDescription className="text-blue-600/80">Inserisci i dati anagrafici del cliente o fornitore.</CardDescription>
            </CardHeader>
            <CardContent>
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
                    <Label htmlFor="ragione_sociale" className="text-zinc-700">Ragione Sociale *</Label>
                    <Input name="ragione_sociale" id="ragione_sociale" placeholder="Es: Rossi Srl" required className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partita_iva" className="text-zinc-700">Partita IVA</Label>
                    <Input name="partita_iva" id="partita_iva" placeholder="11 cifre" className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codice_fiscale" className="text-zinc-700">Codice Fiscale</Label>
                    <Input name="codice_fiscale" id="codice_fiscale" placeholder="16 caratteri" className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codice_sdi" className="text-zinc-700">Codice SDI</Label>
                    <Input name="codice_sdi" id="codice_sdi" placeholder="0000000" className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-zinc-700">Email</Label>
                    <Input name="email" id="email" type="email" placeholder="info@azienda.it" className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefono" className="text-zinc-700">Telefono</Label>
                    <Input name="telefono" id="telefono" placeholder="+39..." className="bg-white border-zinc-200" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="indirizzo" className="text-zinc-700">Indirizzo Sede Legale</Label>
                    <Input name="indirizzo" id="indirizzo" placeholder="Via, civico, CAP, Città" className="bg-white border-zinc-200" />
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white rounded-t-xl">
              <CardTitle className="text-sm font-medium text-zinc-500">Fornitori</CardTitle>
              <Users className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent className="bg-white rounded-b-xl">
              <div className="text-2xl font-bold">{kpis.fornitori}</div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white rounded-t-xl">
              <CardTitle className="text-sm font-medium text-zinc-500">Clienti</CardTitle>
              <Users className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent className="bg-white rounded-b-xl">
              <div className="text-2xl font-bold">{kpis.clienti}</div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white rounded-t-xl">
              <CardTitle className="text-sm font-medium text-zinc-500">Crediti Aperti</CardTitle>
              <TrendingDown className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent className="bg-white rounded-b-xl">
              <div className="text-2xl font-bold text-green-600">€ 0,00</div>
              <p className="text-xs text-zinc-400 mt-1">Placeholder (Step 3)</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white rounded-t-xl">
              <CardTitle className="text-sm font-medium text-zinc-500">Debiti Aperti</CardTitle>
              <Wallet className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent className="bg-white rounded-b-xl">
              <div className="text-2xl font-bold text-red-600">€ 0,00</div>
              <p className="text-xs text-zinc-400 mt-1">Placeholder (Step 3)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtri e Tabella */}
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="border-b border-zinc-100 bg-white">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex bg-zinc-100 p-1 rounded-lg">
                <Link href="/anagrafiche" className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!tipo ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Tutti</Link>
                <Link href="/anagrafiche?tipo=fornitore" className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tipo === 'fornitore' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Fornitori</Link>
                <Link href="/anagrafiche?tipo=cliente" className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tipo === 'cliente' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>Clienti</Link>
              </div>
              
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input placeholder="Cerca ragione sociale o P.IVA..." className="pl-9 bg-white border-zinc-200" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 bg-white">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="w-[30%]">Ragione Sociale</TableHead>
                  <TableHead>Identificativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contatti</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {soggetti.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-8 w-8 text-zinc-300" />
                        <p className="italic">Nessun soggetto trovato in questa categoria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  soggetti.map((s) => (
                    <TableRow key={s.id} className="hover:bg-zinc-50/80 group transition-colors">
                      <TableCell className="font-medium text-zinc-900">
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
                          {s.tipo.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-500 text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5"><Mail size={12} className="text-zinc-400" /> {s.email || '-'}</span>
                          <span className="flex items-center gap-1.5"><Phone size={12} className="text-zinc-400" /> {s.telefono || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-500 text-xs font-medium">
                        {s.condizioni_pagamento}
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