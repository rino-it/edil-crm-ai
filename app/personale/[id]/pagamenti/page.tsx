import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getKPIPersonale, getStoricoPagamentiPersonale } from '@/utils/data-fetcher'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileText, Wallet, CalendarDays, CreditCard, Hash } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pStorico?: string }>
}

export default async function PagamentiPersonalePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { pStorico } = await searchParams

  const supabase = await createClient()

  const { data: persona, error } = await supabase
    .from('personale')
    .select('id, nome, ruolo')
    .eq('id', id)
    .single()

  if (error || !persona) notFound()

  const pageStorico = Number(pStorico) || 1

  const [kpi, storicoPagamenti] = await Promise.all([
    getKPIPersonale(id),
    getStoricoPagamentiPersonale(id, { page: pageStorico, pageSize: 10 })
  ])

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
  const formatData = (d?: string | null) => d ? new Date(d).toLocaleDateString('it-IT') : '-'

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center justify-between gap-3">
          <Link href="/personale">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Torna al Personale
            </Button>
          </Link>
          <Link href={`/personale/${id}/documenti`}>
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="h-4 w-4" /> Documenti
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Wallet className="h-8 w-8 text-blue-600" />
            Pagamenti — {persona.nome}
          </h1>
          <p className="text-zinc-500 mt-1">Storico pagamenti riconciliati associati al personale.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Totale Pagato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{formatEuro(kpi.totale_pagato)}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 flex items-center gap-2">
                <Hash className="h-4 w-4" /> N° Pagamenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{kpi.num_pagamenti}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Ultimo Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-zinc-900">{formatData(kpi.ultimo_pagamento)}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Storico Pagamenti ({storicoPagamenti.totalCount})</CardTitle>
            <CardDescription>Movimenti bancari riconciliati collegati a questo lavoratore.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Conto Banca</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storicoPagamenti.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-zinc-400">
                      Nessun pagamento riconciliato per questa persona.
                    </TableCell>
                  </TableRow>
                ) : (
                  storicoPagamenti.data.map((m: any) => (
                    <TableRow key={m.id} className="hover:bg-zinc-50/50">
                      <TableCell className="whitespace-nowrap">{formatData(m.data_operazione)}</TableCell>
                      <TableCell className="text-sm max-w-[420px] truncate" title={m.descrizione}>{m.descrizione || '-'}</TableCell>
                      <TableCell className={`text-right font-bold ${Number(m.importo) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatEuro(Number(m.importo) || 0)}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-600">
                        {m.conti_banca?.nome_banca || 'N/D'} {m.conti_banca?.nome_conto ? `• ${m.conti_banca.nome_conto}` : ''}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="p-4 border-t border-zinc-100 bg-zinc-50/30">
              <PaginationControls
                totalCount={storicoPagamenti.totalCount}
                currentPage={storicoPagamenti.page}
                pageSize={storicoPagamenti.pageSize}
                totalPages={storicoPagamenti.totalPages}
                paramName="pStorico"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
