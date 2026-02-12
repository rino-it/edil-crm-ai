import { aggiungiMovimento } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from 'next/link'

export default async function NuovaSpesaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Registra Nuova Spesa</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={aggiungiMovimento} className="space-y-4">
            <input type="hidden" name="cantiere_id" value={id} />

            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Input name="descrizione" placeholder="Es. Acquisto Cemento..." required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Importo (€)</Label>
                <Input name="importo" type="number" step="0.01" placeholder="0.00" required />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input name="data" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo di Costo</Label>
              <select name="tipo" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <option value="materiale">Materiale (Fattura/DDT)</option>
                <option value="manodopera">Manodopera (Ore Lavoro)</option>
                <option value="spesa_generale">Spesa Generale</option>
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <Link href={`/cantieri/${id}`} className="w-1/2">
                <Button variant="outline" type="button" className="w-full">Annulla</Button>
              </Link>
              <Button type="submit" className="w-1/2">Salva Spesa</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}