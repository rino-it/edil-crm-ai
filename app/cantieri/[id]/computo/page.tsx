import { createClient } from '@/utils/supabase/server'
import { uploadComputo } from './actions'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Upload, FileSpreadsheet, Brain, AlertCircle, CheckCircle2 } from "lucide-react"

export default async function ComputoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Preleva le voci esistenti con i nuovi campi AI
  const { data: voci } = await supabase
    .from('computo_voci')
    .select('*')
    .eq('cantiere_id', id)
    .order('codice', { ascending: true })

  // Calcolo Statistiche
  const totaleComputo = voci?.reduce((acc, v) => acc + (v.totale || 0), 0) || 0
  const vociAnalizzateAI = voci?.filter(v => v.ai_prezzo_stimato !== null).length || 0
  const vociDaValidare = voci?.filter(v => v.stato_validazione === 'da_validare').length || 0

  // Helper per il colore del badge di confidenza AI
  const getConfidenceBadge = (score: number | null) => {
    if (score === null) return <span className="text-zinc-400 text-xs">N/A</span>;
    const perc = Math.round(score * 100);
    if (score >= 0.85) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Alta ({perc}%)</Badge>;
    if (score >= 0.60) return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Media ({perc}%)</Badge>;
    return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Bassa ({perc}%)</Badge>;
  }

  // Helper per lo stato validazione
  const getStatusBadge = (stato: string | null) => {
    switch(stato) {
      case 'confermato': return <Badge className="bg-green-600">Confermato</Badge>;
      case 'modificato': return <Badge className="bg-blue-600">Modificato</Badge>;
      case 'da_validare': default: return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Da Validare</Badge>;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header con Navigazione */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-2">
              <ArrowLeft size={16} />
              <Link href={`/cantieri/${id}`}>Torna alla Dashboard Cantiere</Link>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-blue-600" /> Computo Metrico
            </h1>
            <p className="text-zinc-500">Gestisci le voci di costo e sfrutta l'AI per la stima dei prezzi.</p>
          </div>
          <div className="text-left md:text-right bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <p className="text-sm text-zinc-500 uppercase tracking-wider font-semibold">Totale Preventivato</p>
            <p className="text-3xl font-bold text-blue-600">€ {totaleComputo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Status Panel AI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border-zinc-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><FileSpreadsheet size={24} /></div>
              <div>
                <p className="text-sm text-zinc-500">Totale Voci</p>
                <p className="text-2xl font-bold">{voci?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-zinc-200 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Brain size={24} /></div>
              <div>
                <p className="text-sm text-zinc-500">Voci analizzate da AI</p>
                <p className="text-2xl font-bold">{vociAnalizzateAI}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`border shadow-sm ${vociDaValidare > 0 ? 'bg-yellow-50/50 border-yellow-200' : 'bg-white border-zinc-200'}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-lg ${vociDaValidare > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-50 text-green-600'}`}>
                {vociDaValidare > 0 ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
              </div>
              <div>
                <p className="text-sm text-zinc-500">Da Validare</p>
                <p className={`text-2xl font-bold ${vociDaValidare > 0 ? 'text-yellow-700' : 'text-green-600'}`}>
                  {vociDaValidare}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sezione Upload */}
        <Card className="border-blue-100 bg-blue-50/30 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-lg">
              <Upload size={18} /> Importa Computo (CSV)
            </CardTitle>
            <CardDescription className="text-blue-600/80">
              Carica un file CSV con le colonne: <strong>Codice, Descrizione, U.M., Quantità, Prezzo</strong>. Le voci senza prezzo verranno analizzate dall'AI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={uploadComputo} className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <input type="hidden" name="cantiere_id" value={id} />
              <div className="grid w-full max-w-md items-center gap-1.5">
                <Input name="file" type="file" accept=".csv" required className="bg-white border-blue-200 hover:border-blue-300 transition-colors" />
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700"><Brain className="mr-2 h-4 w-4" /> Analizza con AI</Button>
            </form>
          </CardContent>
        </Card>

        {/* Tabella Dati Intelligence */}
        <Card className="shadow-sm border-zinc-200 overflow-hidden">
          <CardHeader className="bg-white border-b border-zinc-100 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              Elenco Lavorazioni
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(!voci || voci.length === 0) ? (
              <div className="text-center py-16 text-zinc-500 bg-zinc-50/50">
                <Brain className="h-12 w-12 mx-auto text-zinc-300 mb-4" />
                <p>Nessuna voce presente.</p>
                <p className="text-sm">Carica un computo CSV per avviare l'analisi intelligente dei prezzi.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50/80">
                    <TableRow>
                      <TableHead className="w-[80px]">Codice</TableHead>
                      <TableHead className="min-w-[250px]">Lavorazione</TableHead>
                      <TableHead className="w-[60px] text-center">U.M.</TableHead>
                      <TableHead className="text-right">Q.tà</TableHead>
                      <TableHead className="text-right bg-blue-50/50">Stima AI</TableHead>
                      <TableHead className="text-center bg-blue-50/50">Range Predictor</TableHead>
                      <TableHead className="text-center bg-blue-50/50">Affidabilità</TableHead>
                      <TableHead className="text-right">Prezzo Scelto</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                      <TableHead className="text-center">Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {voci.map((voce) => (
                      <TableRow key={voce.id} className="hover:bg-zinc-50/50 transition-colors">
                        <TableCell className="font-mono text-xs text-zinc-500">{voce.codice}</TableCell>
                        <TableCell className="font-medium text-zinc-800 text-sm">{voce.descrizione}</TableCell>
                        <TableCell className="text-center text-zinc-500">{voce.unita_misura}</TableCell>
                        <TableCell className="text-right font-medium">{voce.quantita}</TableCell>
                        
                        {/* Colonne AI */}
                        <TableCell className="text-right text-blue-700 font-semibold bg-blue-50/20">
                          {voce.ai_prezzo_stimato ? `€ ${voce.ai_prezzo_stimato}` : '-'}
                        </TableCell>
                        <TableCell className="text-center text-xs text-zinc-500 bg-blue-50/20">
                          {voce.ai_prezzo_min && voce.ai_prezzo_max 
                            ? `€${voce.ai_prezzo_min} - €${voce.ai_prezzo_max}` 
                            : '-'}
                        </TableCell>
                        <TableCell className="text-center bg-blue-50/20">
                          {getConfidenceBadge(voce.ai_confidence_score)}
                        </TableCell>

                        {/* Prezzo Finale e Totale */}
                        <TableCell className="text-right font-bold text-zinc-900">
                          € {voce.prezzo_unitario || '0.00'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-zinc-900">
                          € {voce.totale?.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0.00'}
                        </TableCell>
                        
                        {/* Stato */}
                        <TableCell className="text-center">
                          {getStatusBadge(voce.stato_validazione)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}