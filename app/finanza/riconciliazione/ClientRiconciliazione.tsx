'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importaCSVBanca, confermaMatch, rifiutaMatch } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, BrainCircuit, Check, X, Search, Loader2 } from 'lucide-react'

export default function ClientRiconciliazione({ movimenti, scadenzeAperte }: { movimenti: any[], scadenzeAperte: any[] }) {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  // Gestione Upload CSV
  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUploading(true)
    const formData = new FormData(e.currentTarget)
    await importaCSVBanca(formData)
    setIsUploading(false)
    router.refresh()
  }

 // Gestione Matching AI (Architettura a Chunk dal Client per evitare Timeout Vercel)
  const handleAiAnalysis = async () => {
    const daAnalizzare = movimenti.filter(m => !m.ai_suggerimento)
    if (daAnalizzare.length === 0) return;

    setIsAnalyzing(true)
    const CHUNK_SIZE = 10;
    setProgress({ current: 0, total: daAnalizzare.length });

    for (let i = 0; i < daAnalizzare.length; i += CHUNK_SIZE) {
      const chunk = daAnalizzare.slice(i, i + CHUNK_SIZE);
      
      try {
        // Manda 10 movimenti a Vercel
        await fetch('/api/finanza/riconcilia-banca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movimenti: chunk })
        });
      } catch (error) {
        console.error("Errore durante l'analisi del chunk", i, error);
      }

      const processed = Math.min(i + CHUNK_SIZE, daAnalizzare.length);
      setProgress({ current: processed, total: daAnalizzare.length });
      
      // Aggiorniamo l'interfaccia riga per riga!
      router.refresh();

      // Se ci sono altri chunk, fa aspettare il BROWSER (non il server) per 12 secondi
      if (processed < daAnalizzare.length) {
        await new Promise(resolve => setTimeout(resolve, 12000));
      }
    }

    setIsAnalyzing(false)
    setProgress({ current: 0, total: 0 })
  }

  // Wrapper per le Server Actions (RISOLVE L'ERRORE TS)
  const handleConferma = async (formData: FormData) => {
    await confermaMatch(formData)
  }

  const handleRifiuto = async (formData: FormData) => {
    await rifiutaMatch(formData)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">1. Importa Estratto Conto</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="flex gap-3">
              <Input type="file" name="file" accept=".csv" required className="cursor-pointer" />
              <Button type="submit" disabled={isUploading} className="bg-blue-600 hover:bg-blue-700">
                {isUploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Upload className="h-4 w-4 mr-2" />}
                Importa CSV
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">2. Analisi Intelligente</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              {movimenti.filter(m => !m.ai_suggerimento).length} movimenti in attesa di analisi.
            </span>
            <Button onClick={handleAiAnalysis} disabled={isAnalyzing || movimenti.length === 0} className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto">
              {isAnalyzing ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
              {isAnalyzing ? `Analisi: ${progress.current} / ${progress.total}` : "Avvia Matching AI"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Causale Bancaria</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Suggerimento AI</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimenti.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-zinc-400">Nessun movimento da riconciliare.</TableCell>
                </TableRow>
              ) : (
                movimenti.map((m) => {
                  const suggestedScadenza = scadenzeAperte.find(s => s.id === m.ai_suggerimento)
                  const conf = m.ai_confidence || 0
                  const badgeColor = conf > 0.8 ? 'bg-emerald-100 text-emerald-800' : conf > 0.5 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'

                  return (
                    <TableRow key={m.id} className="hover:bg-zinc-50/50">
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(m.data_operazione).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[300px] truncate" title={m.descrizione}>
                        {m.descrizione}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${m.importo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatEuro(m.importo)}
                      </TableCell>
                      <TableCell>
                        {m.ai_suggerimento ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold">{suggestedScadenza?.soggetto?.ragione_sociale || 'Soggetto Ignoto'}</span>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className={`${badgeColor} border-none`}>
                                {(conf * 100).toFixed(0)}% Match
                              </Badge>
                              <span className="text-zinc-500 truncate max-w-[150px]" title={m.ai_motivo}>{m.ai_motivo}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Nessun suggerimento. Clicca su "Avvia Matching AI".</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {m.ai_suggerimento ? (
                            <>
                              <form action={handleConferma}>
                                <input type="hidden" name="movimento_id" value={m.id} />
                                <input type="hidden" name="scadenza_id" value={m.ai_suggerimento} />
                                <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                                <Button size="sm" type="submit" className="bg-emerald-600 hover:bg-emerald-700 h-8 px-2" title="Conferma">
                                  <Check className="h-4 w-4" />
                                </Button>
                              </form>
                              <form action={handleRifiuto}>
                                <input type="hidden" name="movimento_id" value={m.id} />
                                <Button size="sm" type="submit" variant="outline" className="text-rose-600 hover:bg-rose-50 h-8 px-2" title="Rifiuta">
                                  <X className="h-4 w-4" />
                                </Button>
                              </form>
                            </>
                          ) : (
                            <form action={handleConferma} className="flex gap-2 items-center">
                              <input type="hidden" name="movimento_id" value={m.id} />
                              <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                              <select name="scadenza_id" required className="h-8 text-xs border border-zinc-200 rounded px-2 w-[150px] outline-none">
                                <option value="">Seleziona manuale...</option>
                                {scadenzeAperte.filter(s => (m.importo > 0 ? s.tipo === 'entrata' : s.tipo === 'uscita')).map(s => (
                                  <option key={s.id} value={s.id}>{s.soggetto?.ragione_sociale} - {formatEuro(s.importo_totale)}</option>
                                ))}
                              </select>
                              <Button size="sm" type="submit" variant="secondary" className="h-8 px-2" title="Collega">
                                <Search className="h-4 w-4" />
                              </Button>
                            </form>
                          )}
                        </div>
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
  )
}