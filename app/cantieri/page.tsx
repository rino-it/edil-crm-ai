import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Plus, FileSpreadsheet } from "lucide-react"

export default async function CantieriPage() {
  const supabase = await createClient()

  // 1. Verifica Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // 2. Preleva i cantieri dal DB
  const { data: cantieri } = await supabase
    .from('cantieri')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/cantieri/nuovo" className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <Plus className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Nuovo Cantiere</p>
              <p className="text-xs text-blue-200">Crea un nuovo progetto</p>
            </div>
          </Link>
          <Link href="/personale" className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 rounded-lg transition-colors">
            <Users className="h-5 w-5 text-zinc-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-zinc-800">Gestione Personale</p>
              <p className="text-xs text-zinc-500">Anagrafica e documenti</p>
            </div>
          </Link>
          <Link href="/preventivi" className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 rounded-lg transition-colors">
            <FileSpreadsheet className="h-5 w-5 text-zinc-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-zinc-800">Preventivazione</p>
              <p className="text-xs text-zinc-500">Crea e gestisci preventivi</p>
            </div>
          </Link>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Cantieri</h1>
            <p className="text-zinc-500">Gestisci i tuoi progetti attivi e l'archivio.</p>
          </div>
          <Link href="/cantieri/nuovo">
            <Button>+ Nuovo Cantiere</Button>
          </Link>
        </div>

        {(!cantieri || cantieri.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-lg bg-zinc-50/50">
            <p className="text-muted-foreground mb-4">Nessun cantiere trovato</p>
            <Link href="/cantieri/nuovo">
              <Button variant="outline">Crea il primo cantiere</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cantieri.map((cantiere) => (
              <Link href={`/cantieri/${cantiere.id}`} key={cantiere.id} className="block group">
                <Card className="h-full hover:shadow-lg transition-all duration-200 cursor-pointer border-zinc-200 group-hover:border-blue-500/50">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start mb-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {cantiere.codice}
                      </Badge>
                      <Badge variant={cantiere.stato === 'aperto' ? 'default' : 'secondary'}>
                        {cantiere.stato}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                      {cantiere.nome || cantiere.descrizione}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-zinc-600 pb-3">
                    <p className="flex items-center gap-2">
                      📍 {cantiere.indirizzo || 'Nessun indirizzo'}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-3 border-t bg-zinc-50/30 flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-semibold text-zinc-900">
                      € {cantiere.budget?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}