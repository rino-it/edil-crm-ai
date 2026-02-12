import { createClient } from '@/utils/supabase/server'
import { uploadComputo } from './actions'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Upload, FileSpreadsheet } from "lucide-react"

export default async function ComputoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Preleva le voci esistenti
  const { data: voci } = await supabase
    .from('computo_voci')
    .select('*')
    .eq('cantiere_id', id)
    .order('codice', { ascending: true })

  // Calcolo Totale
  const totaleComputo = voci?.reduce((acc, v) => acc + (v.totale || 0), 0) || 0

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header con Navigazione */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-2">
              <ArrowLeft size={16} />
              <Link href={`/cantieri/${id}`}>Torna alla Dashboard Cantiere</Link>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900">Computo Metrico</h1>
            <p className="text-zinc-500">Gestisci le voci di costo previste per questo cantiere.</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-500">Totale Preventivato</p>
            <p className="text-2xl font-bold text-blue-600">€ {totaleComputo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Sezione Upload */}
        <Card className="border-blue-100 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Upload size={20} /> Importa CSV
            </CardTitle>
            <CardDescription className="text-blue-600/80">
              Carica un file CSV con le colonne: <strong>Codice, Descrizione, U.M., Quantità, Prezzo</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={uploadComputo} className="flex gap-4 items-end">
              <input type="hidden" name="cantiere_id" value={id} />
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Input name="file" type="file" accept=".csv" required className="bg-white" />
              </div>
              <Button type="submit">Carica File</Button>
            </form>
          </CardContent>
        </Card>

        {/* Tabella Dati */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={20} /> Voci di Costo ({voci?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!voci || voci.length === 0) ? (
              <div className="text-center py-12 text-muted-foreground">
                Nessuna voce presente. Carica un computo per iniziare.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Codice</TableHead>
                    <TableHead>Descrizione Lavorazione</TableHead>
                    <TableHead className="w-[80px]">U.M.</TableHead>
                    <TableHead className="text-right">Q.tà</TableHead>
                    <TableHead className="text-right">Prezzo Unit.</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {voci.map((voce) => (
                    <TableRow key={voce.id}>
                      <TableCell className="font-medium text-zinc-500">{voce.codice}</TableCell>
                      <TableCell>{voce.descrizione}</TableCell>
                      <TableCell className="text-zinc-500">{voce.unita_misura}</TableCell>
                      <TableCell className="text-right">{voce.quantita}</TableCell>
                      <TableCell className="text-right">€ {voce.prezzo_unitario}</TableCell>
                      <TableCell className="text-right font-bold">€ {voce.totale?.toLocaleString('it-IT')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}