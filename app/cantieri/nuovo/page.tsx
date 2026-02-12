import { creaCantiere } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from 'next/link'

export default function NuovoCantierePage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Nuovo Cantiere</CardTitle>
            <Link href="/cantieri" className="text-sm text-blue-600 hover:underline">
              Annulla e torna indietro
            </Link>
          </div>
          <CardDescription>Inserisci i dettagli del nuovo progetto per iniziare a tracciare le spese.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={creaCantiere} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codice">Codice Commessa</Label>
                <Input name="codice" id="codice" placeholder="Es. 2024-001" required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="budget">Budget Stimato (€)</Label>
                <Input name="budget" id="budget" type="number" step="0.01" placeholder="50000" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descrizione">Nome Cantiere / Descrizione</Label>
              <Input name="descrizione" id="descrizione" placeholder="Ristrutturazione Villa..." required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="indirizzo">Indirizzo Cantiere</Label>
              <Input name="indirizzo" id="indirizzo" placeholder="Via Roma 123, Milano" />
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full md:w-auto">
                Salva e Crea Progetto
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}