'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Save, Loader2, Landmark, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { creaMutuo } from '../../actions'

type ContoBanca = { id: string; nome_banca: string; nome_conto: string }

export function CreaMutuoDialog({ conti }: { conti: ContoBanca[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showSpese, setShowSpese] = useState(false)
  const [tipoTasso, setTipoTasso] = useState<'fisso' | 'variabile' | 'misto'>('fisso')
  const [periodicita, setPeriodicita] = useState<'mensile' | 'trimestrale' | 'semestrale' | 'annuale'>('mensile')

  async function handleSubmit(formData: FormData) {
    formData.set('tipo_tasso', tipoTasso)
    formData.set('periodicita', periodicita)

    startTransition(async () => {
      try {
        await creaMutuo(formData)
        setIsOpen(false)
        setShowSpese(false)
        setTipoTasso('fisso')
        setPeriodicita('mensile')
      } catch (error) {
        alert("Errore durante il salvataggio del mutuo")
      }
    })
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
        <Plus className="h-4 w-4 mr-2" /> Nuovo Mutuo
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b shrink-0">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5 text-blue-600" /> Nuovo Mutuo / Finanziamento
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
            </div>

            <form action={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">

              {/* Conto associato */}
              <div className="space-y-2">
                <Label htmlFor="conto_banca_id">Conto Bancario Associato *</Label>
                <select
                  id="conto_banca_id"
                  name="conto_banca_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Seleziona conto...</option>
                  {conti.map(c => (
                    <option key={c.id} value={c.id}>{c.nome_banca} - {c.nome_conto}</option>
                  ))}
                </select>
              </div>

              {/* Banca e Pratica */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="banca_erogante">Banca Erogante *</Label>
                  <Input id="banca_erogante" name="banca_erogante" placeholder="Es. Intesa Sanpaolo" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_pratica">N° Pratica</Label>
                  <Input id="numero_pratica" name="numero_pratica" placeholder="Opzionale" />
                </div>
              </div>

              {/* Scopo */}
              <div className="space-y-2">
                <Label htmlFor="scopo">Scopo / Descrizione</Label>
                <Input id="scopo" name="scopo" placeholder="Es. Acquisto escavatore, Anticipo fatture..." />
              </div>

              {/* Importi principali */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capitale_erogato">Capitale Erogato (€) *</Label>
                  <Input id="capitale_erogato" name="capitale_erogato" type="number" step="0.01" placeholder="100000.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="importo_rata">Importo Rata (€) *</Label>
                  <Input id="importo_rata" name="importo_rata" type="number" step="0.01" placeholder="850.00" required />
                </div>
              </div>

              {/* Numero rate + Periodicità */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numero_rate">Numero Rate *</Label>
                  <Input id="numero_rate" name="numero_rate" type="number" min="1" placeholder="120" required />
                </div>
                <div className="space-y-2">
                  <Label>Periodicità</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {(['mensile', 'trimestrale', 'semestrale', 'annuale'] as const).map(p => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPeriodicita(p)}
                        className={`text-xs py-1.5 px-2 rounded border transition-all capitalize ${periodicita === p ? 'bg-blue-50 border-blue-600 text-blue-700 font-bold' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data_prima_rata">Data Prima Rata *</Label>
                  <Input id="data_prima_rata" name="data_prima_rata" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_stipula">Data Stipula</Label>
                  <Input id="data_stipula" name="data_stipula" type="date" />
                </div>
              </div>

              {/* Tipo tasso + TAEG */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Tasso</Label>
                  <div className="flex gap-1">
                    {(['fisso', 'variabile', 'misto'] as const).map(t => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setTipoTasso(t)}
                        className={`text-xs py-1.5 px-3 rounded border transition-all capitalize flex-1 ${tipoTasso === t ? 'bg-blue-50 border-blue-600 text-blue-700 font-bold' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taeg_isc">TAEG / ISC (%)</Label>
                  <Input id="taeg_isc" name="taeg_isc" type="number" step="0.0001" placeholder="3.5" />
                </div>
              </div>

              {/* Spese accessorie (collapsible) */}
              <div className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowSpese(!showSpese)}
                  className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  <span>Spese Accessorie</span>
                  {showSpese ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showSpese && (
                  <div className="p-3 pt-0 grid grid-cols-2 gap-3 animate-in slide-in-from-top-1">
                    <div className="space-y-1">
                      <Label htmlFor="spese_istruttoria" className="text-xs">Istruttoria (€)</Label>
                      <Input id="spese_istruttoria" name="spese_istruttoria" type="number" step="0.01" defaultValue="0" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="spese_perizia" className="text-xs">Perizia (€)</Label>
                      <Input id="spese_perizia" name="spese_perizia" type="number" step="0.01" defaultValue="0" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="spese_incasso_rata" className="text-xs">Incasso Rata (€)</Label>
                      <Input id="spese_incasso_rata" name="spese_incasso_rata" type="number" step="0.01" defaultValue="0" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="spese_gestione_pratica" className="text-xs">Gestione Pratica (€)</Label>
                      <Input id="spese_gestione_pratica" name="spese_gestione_pratica" type="number" step="0.01" defaultValue="0" />
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <textarea
                  id="note"
                  name="note"
                  rows={2}
                  placeholder="Note aggiuntive..."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
                <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Crea Mutuo e Rate
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
