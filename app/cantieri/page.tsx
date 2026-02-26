import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StaggeredGrid } from '@/components/StaggeredGrid'

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
    <div className="animate-in fade-in duration-300">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight text-zinc-900">Cantieri</h1>
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
          <StaggeredGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cantieri.map((cantiere) => (
              <Link href={`/cantieri/${cantiere.id}`} key={cantiere.id} className="block group">
                <Card className="h-full card-hover border-border/60">
                  <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {cantiere.codice}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${cantiere.stato === 'aperto' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        <Badge variant={cantiere.stato === 'aperto' ? 'default' : 'secondary'} className="text-xs">
                          {cantiere.stato}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">
                      {cantiere.nome || cantiere.descrizione}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground py-3">
                    <p className="flex items-center gap-2">
                      📍 {cantiere.indirizzo || 'Nessun indirizzo'}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-3 border-t border-border/40 bg-muted/30 flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-semibold text-foreground">
                      € {cantiere.budget?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </StaggeredGrid>
        )}
      </div>
    </div>
  )
}