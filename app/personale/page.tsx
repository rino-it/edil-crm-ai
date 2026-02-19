import { createClient } from '@/utils/supabase/server'
import { addPersona, deletePersona } from './actions'
import { getDocumentiInScadenza } from '@/utils/data-fetcher'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, Euro, Phone, Trash2, FileText, AlertTriangle, CheckCircle2 } from "lucide-react"
import Link from 'next/link'

export default async function PersonalePage() {
  const supabase = await createClient()

  const [{ data: personale }, documentiInScadenza] = await Promise.all([
    supabase.from('personale').select('*').order('nome', { ascending: true }),
    getDocumentiInScadenza(30),
  ])

  // Mappa personale_id → numero documenti in scadenza
  const scadenzePerPersona: Record<string, number> = {}
  for (const doc of documentiInScadenza) {
    scadenzePerPersona[doc.personale_id] = (scadenzePerPersona[doc.personale_id] || 0) + 1
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-600" /> Gestione Personale
            </h1>
            <p className="text-zinc-500">Anagrafica, costi e documenti dei dipendenti.</p>
          </div>
          {documentiInScadenza.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>
                <strong>{documentiInScadenza.length}</strong> documento/i in scadenza nei prossimi 30 giorni
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* TABELLA PERSONALE */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Anagrafica Lavoratori ({personale?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {(!personale || personale.length === 0) ? (
                <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
                  Nessun lavoratore registrato.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Ruolo</TableHead>
                      <TableHead>Costo Orario</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {personale.map((p) => {
                      const nScadenze = scadenzePerPersona[p.id] || 0
                      const haCostoConfig = p.costo_config && Object.keys(p.costo_config).length > 0
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span>{p.nome}</span>
                                {nScadenze > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded-full">
                                    <AlertTriangle className="h-3 w-3" /> {nScadenze}
                                  </span>
                                )}
                                {haCostoConfig && (
                                  <span title="Profilo costo configurato" className="text-green-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-400 flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {p.telefono || 'N/D'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-normal">
                              {p.ruolo || 'Nessuno'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-zinc-700">
                            € {p.costo_orario?.toLocaleString('it-IT', { minimumFractionDigits: 2 })} / h
                          </TableCell>
                          <TableCell>
                            {p.attivo ? (
                              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">Attivo</span>
                            ) : (
                              <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">Inattivo</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/personale/${p.id}/documenti`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`flex items-center gap-1 text-xs ${nScadenze > 0 ? 'text-red-600 hover:text-red-800 hover:bg-red-50' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'}`}
                                >
                                  <FileText className="h-4 w-4" />
                                  {nScadenze > 0 ? `⚠️ Doc` : 'Doc'}
                                </Button>
                              </Link>
                              <form action={deletePersona}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button variant="ghost" size="sm" type="submit" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* FORM AGGIUNTA */}
          <Card className="h-fit">
            <CardHeader className="bg-zinc-100/50 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                Nuovo Lavoratore
              </CardTitle>
              <CardDescription>Inserisci i dati per il calcolo costi</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form action={addPersona} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo *</Label>
                  <Input id="nome" name="nome" required placeholder="Es. Mario Rossi" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ruolo">Qualifica / Ruolo</Label>
                  <Input id="ruolo" name="ruolo" placeholder="Es. Operaio, Idraulico..." />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="indirizzo_partenza">Indirizzo di Partenza</Label>
                  <Input id="indirizzo_partenza" name="indirizzo_partenza" placeholder="Es. Via Roma 1, Bergamo" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="costo_orario">Costo Orario (€)</Label>
                    <div className="relative">
                      <Euro className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                      <Input id="costo_orario" name="costo_orario" type="number" step="0.01" className="pl-8" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefono">Telefono</Label>
                    <Input id="telefono" name="telefono" placeholder="+39..." />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="attivo" name="attivo" defaultChecked className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600" />
                  <Label htmlFor="attivo" className="font-normal cursor-pointer">Lavoratore attivo</Label>
                </div>

                <Button type="submit" className="w-full mt-4">Salva Anagrafica</Button>
              </form>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
