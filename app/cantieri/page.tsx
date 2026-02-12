import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function CantieriPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: cantieri } = await supabase
    .from('cantieri')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
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
              <Card key={cantiere.id} className="hover:shadow-lg transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {cantiere.codice}
                    </Badge>
                    <Badge variant={cantiere.stato === 'aperto' ? 'default' : 'secondary'}>
                      {cantiere.stato}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl">{cantiere.descrizione}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-zinc-600 pb-3">
                  <p className="flex items-center gap-2">
                    📍 {cantiere.indirizzo || 'Nessun indirizzo'}
                  </p>
                </CardContent>
                <CardFooter className="pt-3 border-t bg-zinc-50/50 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-semibold text-zinc-900">
                    € {cantiere.budget?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}