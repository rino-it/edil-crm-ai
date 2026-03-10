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

  // 3. Calcolo Saldo IVA globale (da scadenze assegnate a cantieri con aliquota_iva)
  const { data: scadenzeConIva } = await supabase
    .from('scadenze_pagamento')
    .select('importo_totale, aliquota_iva')
    .not('cantiere_id', 'is', null)
    .not('aliquota_iva', 'is', null)
    .gt('aliquota_iva', 0)

  let totaleIvaCredito = 0
  const ivaPerAliquota: Record<number, number> = {}
  if (scadenzeConIva) {
    for (const s of scadenzeConIva) {
      const aliquota = s.aliquota_iva || 22
      const importo = Number(s.importo_totale) || 0
      const iva = Math.round((importo / (100 + aliquota)) * aliquota * 100) / 100
      totaleIvaCredito += iva
      ivaPerAliquota[aliquota] = (ivaPerAliquota[aliquota] || 0) + iva
    }
  }
  totaleIvaCredito = Math.round(totaleIvaCredito * 100) / 100

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

        {/* Saldo IVA Globale */}
        {totaleIvaCredito > 0 && (
          <Card className="border-purple-200 bg-purple-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-purple-900 flex items-center gap-2">
                Saldo IVA — Credito d&apos;Imposta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-purple-800 font-mono">
                  {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totaleIvaCredito)}
                </span>
                <span className="text-sm text-purple-600">IVA detraibile da fatture assegnate a cantieri</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(ivaPerAliquota)
                  .sort(([a], [b]) => Number(b) - Number(a))
                  .map(([aliquota, importo]) => (
                    <div key={aliquota} className="rounded-md bg-white border border-purple-200 px-3 py-1.5 text-sm">
                      <span className="text-purple-500 font-medium">IVA {aliquota}%</span>
                      <span className="ml-2 font-mono font-bold text-purple-800">
                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo)}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

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