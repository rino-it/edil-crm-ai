import { createClient } from '@/utils/supabase/server'
import { addPersona, editPersona, deletePersona } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Users, Euro, Phone, Settings, Trash2, Edit } from "lucide-react"

export default async function PersonalePage() {
  const supabase = await createClient()

  // Fetch dei dati ordinati per nome
  const { data: personale } = await supabase
    .from('personale')
    .select('*')
    .order('nome', { ascending: true })

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <Users className="h-8 w-8 text-blue-600" /> Gestione Personale
            </h1>
            <p className="text-zinc-500">Aggiungi dipendenti e subappaltatori per tracciare i costi della manodopera.</p>
          </div>
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
                    {personale.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{p.nome}</span>
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
                          <form action={deletePersona}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button variant="ghost" size="sm" type="submit" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
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
                  <Label htmlFor="attivo" className="font-normal cursor-pointer">Lavoratore attivo (Visibile all'AI)</Label>
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