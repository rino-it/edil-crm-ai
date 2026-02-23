import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { 
  getSoggettoById, 
  getEsposizioneSoggetto, 
  getStoricoPaymentsSoggetto, 
  getFattureAperteSoggetto 
} from '@/utils/data-fetcher'
import { editSoggetto, deleteSoggetto } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// FIX: Aggiunto Wallet agli import di lucide-react
import { ArrowLeft, Save, Trash2, Receipt, History, Wallet } from "lucide-react"
import Link from 'next/link'

export default async function SoggettoDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const soggetto = await getSoggettoById(id)
  if (!soggetto) notFound()

  // STEP 5B e 5C: Chiamate parallele per i dati della Scheda Fornitore
  const [esposizione, storicoPagamenti, fattureAperte] = await Promise.all([
    getEsposizioneSoggetto(id),
    getStoricoPaymentsSoggetto(id),
    getFattureAperteSoggetto(id)
  ])

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Navigazione e Titolo */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Link href="/anagrafiche" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-2">
              <ArrowLeft size={16} /> Torna alle anagrafiche
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{soggetto.ragione_sociale}</h1>
              <Badge className={soggetto.tipo === 'cliente' ? 'bg-green-600' : 'bg-orange-600'}>
                {soggetto.tipo.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Colonna Sinistra: Form Modifica */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dati Anagrafici</CardTitle>
                <CardDescription>Modifica le informazioni di base e i riferimenti legali.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={editSoggetto} className="space-y-4">
                  <input type="hidden" name="id" value={soggetto.id} />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tipo">Tipo</Label>
                      <select 
                        name="tipo" 
                        defaultValue={soggetto.tipo}
                        className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="fornitore">Fornitore</option>
                        <option value="cliente">Cliente</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ragione_sociale">Ragione Sociale</Label>
                      <Input name="ragione_sociale" defaultValue={soggetto.ragione_sociale} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partita_iva">Partita IVA</Label>
                      <Input name="partita_iva" defaultValue={soggetto.partita_iva || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codice_fiscale">Codice Fiscale</Label>
                      <Input name="codice_fiscale" defaultValue={soggetto.codice_fiscale || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input name="email" type="email" defaultValue={soggetto.email || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telefono">Telefono</Label>
                      <Input name="telefono" defaultValue={soggetto.telefono || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="codice_sdi">Codice SDI</Label>
                      <Input name="codice_sdi" defaultValue={soggetto.codice_sdi || '0000000'} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pec">PEC</Label>
                      <Input name="pec" defaultValue={soggetto.pec || ''} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="indirizzo">Indirizzo Sede</Label>
                    <Input name="indirizzo" defaultValue={soggetto.indirizzo || ''} />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                      <Save className="mr-2 h-4 w-4" /> Salva Modifiche
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Amministrazione e Pagamenti</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={editSoggetto} className="space-y-4">
                  <input type="hidden" name="id" value={soggetto.id} />
                  <input type="hidden" name="ragione_sociale" value={soggetto.ragione_sociale} />
                  <input type="hidden" name="tipo" value={soggetto.tipo} />

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="iban">IBAN</Label>
                      <Input name="iban" defaultValue={soggetto.iban || ''} placeholder="IT..." className="font-mono" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="condizioni_pagamento">Condizioni di Pagamento Standard</Label>
                      <Input name="condizioni_pagamento" defaultValue={soggetto.condizioni_pagamento || '30gg DFFM'} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="note">Note Interne</Label>
                      <textarea 
                        name="note" 
                        defaultValue={soggetto.note || ''} 
                        rows={4}
                        className="flex min-h-[80px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button type="submit" variant="outline" className="border-blue-200 text-blue-700">
                      <Save className="mr-2 h-4 w-4" /> Aggiorna Impostazioni
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Colonna Destra: Stats e Pericolo */}
          <div className="space-y-6">
            <Card className="bg-zinc-900 text-white shadow-xl">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Status Finanziario
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-zinc-400 text-xs">Da pagare</p>
                  <p className="text-3xl font-bold text-rose-400">{formatEuro(esposizione.totale_da_pagare)}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4">
                  <div>
                    <p className="text-zinc-500 text-xs">Totale Fatturato</p>
                    <p className="text-sm font-semibold">{formatEuro(esposizione.totale_fatture)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Totale Pagato</p>
                    <p className="text-sm font-semibold text-emerald-400">{formatEuro(esposizione.totale_pagato)}</p>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-zinc-400 text-xs">Fatture Aperte</p>
                  <p className="text-xl font-semibold">{esposizione.fatture_aperte}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-100 bg-red-50/30">
              <CardHeader>
                <CardTitle className="text-red-800 text-sm">Zona Pericolo</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={deleteSoggetto}>
                  <input type="hidden" name="id" value={soggetto.id} />
                  <Button type="submit" variant="destructive" className="w-full">
                    <Trash2 className="mr-2 h-4 w-4" /> Elimina Soggetto
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sezione Fatture Aperte */}
        <Card className="mt-8 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-zinc-500" />
                Fatture Aperte ({fattureAperte.length})
              </CardTitle>
              <CardDescription>Elenco delle fatture non ancora saldate completamente.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Fattura</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead className="text-right">Pagato</TableHead>
                  <TableHead className="text-right font-bold">Residuo</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fattureAperte.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-400">Nessuna fattura aperta al momento.</TableCell></TableRow>
                ) : (
                  fattureAperte.map((f) => {
                    const residuo = Number(f.importo_totale) - Number(f.importo_pagato || 0);
                    const isScaduta = new Date(f.data_scadenza) < new Date();
                    
                    return (
                      <TableRow key={f.id} className="hover:bg-zinc-50/50">
                        <TableCell className="text-sm">
                          {new Date(f.data_scadenza).toLocaleDateString('it-IT')}
                        </TableCell>
                        <TableCell className="font-medium">{f.fattura_riferimento || 'N/D'}</TableCell>
                        <TableCell className="text-right">{formatEuro(Number(f.importo_totale))}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatEuro(Number(f.importo_pagato || 0))}</TableCell>
                        <TableCell className="text-right font-bold">{formatEuro(residuo)}</TableCell>
                        <TableCell>
                          {isScaduta ? (
                            <Badge variant="destructive" className="animate-pulse">Scaduta</Badge>
                          ) : f.stato === 'parziale' ? (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-none">Parziale</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-rose-100 text-rose-800 border-none">Da pagare</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sezione Storico Pagamenti */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-zinc-500" />
                Storico Pagamenti Riconciliati
              </CardTitle>
              <CardDescription>Ultimi pagamenti e acconti registrati e verificati tramite la banca.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Op.</TableHead>
                  <TableHead>Causale Bancaria</TableHead>
                  <TableHead>Fattura Associata</TableHead>
                  <TableHead className="text-right">Importo Banca</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storicoPagamenti.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-400">Nessun pagamento registrato nello storico.</TableCell></TableRow>
                ) : (
                  storicoPagamenti.map((m: any) => {
                    const isAcconto = !m.scadenza_id;
                    const fattura = m.scadenze_pagamento ? m.scadenze_pagamento.fattura_riferimento : 'Nessuna';
                    
                    return (
                      <TableRow key={m.id} className="hover:bg-zinc-50/50">
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(m.data_operazione).toLocaleDateString('it-IT')}
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[250px]" title={m.descrizione}>
                          {m.descrizione}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {isAcconto ? <span className="text-zinc-400 italic">Acconto Generico</span> : fattura}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${m.importo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatEuro(m.importo)}
                        </TableCell>
                        <TableCell>
                          {isAcconto ? (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-none">Acconto</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-none">Saldato</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}