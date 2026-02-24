'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
// FIX 6B: Aggiornato l'import con la nuova action agnostica
import { importaEstrattoConto, confermaMatch, rifiutaMatch } from './actions'
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
  
  // Stato reattivo locale per i movimenti
  const [movimentiLocali, setMovimentiLocali] = useState(movimenti);

  // Stato per tracciare la selezione manuale del soggetto per ogni movimento
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    setMovimentiLocali(movimenti);
  }, [movimenti]);

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUploading(true)
    const formData = new FormData(e.currentTarget)
    // FIX 6B: Usiamo la nuova action che supporta sia CSV che XML
    await importaEstrattoConto(formData)
    setIsUploading(false)
    router.refresh()
  }

  const handleAiAnalysis = async () => {
    const daAnalizzare = movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore")))
    if (daAnalizzare.length === 0) return;

    setIsAnalyzing(true)
    
    // Chunk size a 3 per evitare timeout Vercel
    const CHUNK_SIZE = 25; 
    setProgress({ current: 0, total: daAnalizzare.length });

    for (let i = 0; i < daAnalizzare.length; i += CHUNK_SIZE) {
      const chunk = daAnalizzare.slice(i, i + CHUNK_SIZE);
      let success = false;
      let retries = 0;
      
      while (!success && retries < 2) {
        try {
          const response = await fetch('/api/finanza/riconcilia-banca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movimenti: chunk })
          });
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const data = await response.json();
          
          if (data.risultati && Array.isArray(data.risultati)) {
            const receivedIds = new Set(data.risultati.map((r: any) => r.movimento_id));
            
            setMovimentiLocali((prevMovimenti) => 
              prevMovimenti.map((mov) => {
                const match = data.risultati.find((r: any) => r.movimento_id === mov.id);
                if (match) {
                  return { 
                    ...mov, 
                    ai_suggerimento: match.scadenza_id || null, 
                    soggetto_id: match.soggetto_id || null,
                    ai_confidence: match.confidence || 0, 
                    ai_motivo: match.motivo || "Analisi completata",
                    ragione_sociale: match.ragione_sociale || null
                  };
                }
                if (chunk.some(c => c.id === mov.id) && !receivedIds.has(mov.id)) {
                  return { ...mov, ai_motivo: "AI non ha fornito risposta", ai_confidence: 0 };
                }
                return mov;
              })
            );
            success = true;
          }
        } catch (error) {
          retries++;
          if (retries >= 2) {
            setMovimentiLocali((prev) => prev.map((mov) => {
              if (chunk.some(c => c.id === mov.id) && !mov.ai_motivo) {
                return { ...mov, ai_motivo: "Errore analisi AI - riprovare", ai_confidence: 0 };
              }
              return mov;
            }));
          } else {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      const processed = Math.min(i + CHUNK_SIZE, daAnalizzare.length);
      setProgress({ current: processed, total: daAnalizzare.length });
      
      if (processed < daAnalizzare.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    setIsAnalyzing(false)
    setProgress({ current: 0, total: 0 })
    router.refresh();
  }

  const handleConferma = async (formData: FormData) => {
    const movId = formData.get('movimento_id') as string;
    await confermaMatch(formData);
    setMovimentiLocali(prev => prev.filter(m => m.id !== movId));
  }

  const handleRifiuta = async (formData: FormData) => {
    const movId = formData.get('movimento_id') as string;
    await rifiutaMatch(formData);
    setMovimentiLocali(prev => prev.map(m => 
      m.id === movId ? { ...m, ai_suggerimento: null, soggetto_id: null, ai_confidence: null, ai_motivo: null, ragione_sociale: null } : m
    ));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">1. Importa Estratto Conto</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="flex gap-3">
              {/* FIX 6A: Aggiunto accept=".xml" */}
              <Input type="file" name="file" accept=".csv,.xml" required className="cursor-pointer" />
              <Button type="submit" disabled={isUploading} className="bg-blue-600 hover:bg-blue-700">
                {isUploading ? <Loader2 className="animate-spin h-4 w-4" /> : <Upload className="h-4 w-4 mr-2" />}
                {/* FIX 6C: Testo generico */}
                Importa File
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">2. Analisi Intelligente</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              {movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore"))).length} movimenti pronti per analisi AI.
            </span>
            <Button onClick={handleAiAnalysis} disabled={isAnalyzing || movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore"))).length === 0} className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto">
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
                <TableHead>Suggerimento</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentiLocali.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-zinc-400">Nessun movimento da riconciliare.</TableCell>
                </TableRow>
              ) : (
                movimentiLocali.map((m) => {
                  const suggestedScadenza = scadenzeAperte.find(s => s.id === m.ai_suggerimento);
                  const suggestedSoggetto = scadenzeAperte.find(s => s.soggetto_id === m.soggetto_id);
                  const conf = m.ai_confidence || 0;
                  const isAcconto = m.soggetto_id && !m.ai_suggerimento;

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
                            <span className="text-sm font-semibold">
                              {m.ragione_sociale || suggestedScadenza?.soggetto?.ragione_sociale || suggestedScadenza?.anagrafica_soggetti?.ragione_sociale || 'Match Trovato'}
                            </span>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className={`${conf >= 0.95 ? 'bg-emerald-100 text-emerald-800' : conf >= 0.8 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'} border-none`}>
                                {(conf * 100).toFixed(0)}% Match
                              </Badge>
                              <span className="text-zinc-500 truncate max-w-[150px]" title={m.ai_motivo}>{m.ai_motivo}</span>
                            </div>
                          </div>
                        ) : m.ai_motivo ? (
                          <div className="flex flex-col gap-1">
                            {isAcconto && (m.ragione_sociale || suggestedSoggetto) && (
                              <span className="text-sm font-semibold">
                                {m.ragione_sociale || suggestedSoggetto?.soggetto?.ragione_sociale || suggestedSoggetto?.anagrafica_soggetti?.ragione_sociale}
                              </span>
                            )}
                            <span className="text-xs text-amber-600 italic truncate max-w-[200px]" title={m.ai_motivo}>{m.ai_motivo}</span>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-none w-fit">
                              {isAcconto ? 'Acconto Rilevato' : 'Nessun Match'} ({(conf * 100).toFixed(0)}%)
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">In attesa di analisi.</span>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {(m.ai_suggerimento || isAcconto) ? (
                            <>
                              <form action={handleConferma}>
                                <input type="hidden" name="movimento_id" value={m.id} />
                                {m.ai_suggerimento && <input type="hidden" name="scadenza_id" value={m.ai_suggerimento} />}
                                {m.soggetto_id && <input type="hidden" name="soggetto_id" value={m.soggetto_id} />}
                                <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                                <Button size="sm" type="submit" className="bg-emerald-600 hover:bg-emerald-700 h-8 px-2" title="Conferma">
                                  <Check className="h-4 w-4" />
                                </Button>
                              </form>
                              <form action={handleRifiuta}>
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
                              
                              <select 
                                name="scadenza_id" 
                                required 
                                className="h-8 text-xs border border-zinc-200 rounded px-2 w-[150px] outline-none"
                                onChange={(e) => {
                                  const selected = scadenzeAperte.find(s => s.id === e.target.value);
                                  if (selected) {
                                    setManualSelections(prev => ({ ...prev, [m.id]: selected.soggetto_id || '' }));
                                  }
                                }}
                              >
                                <option value="">Seleziona manuale...</option>
                                {scadenzeAperte
                                  .filter(s => (m.importo > 0 ? s.tipo === 'entrata' : s.tipo === 'uscita'))
                                  .map(s => (
                                    <option key={s.id} value={s.id}>
                                      {s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale} - {formatEuro(s.importo_totale)}
                                    </option>
                                  ))}
                              </select>
                              <input type="hidden" name="soggetto_id" value={manualSelections[m.id] || ''} />

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