'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Save, Loader2, FileText, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { creaTitolo } from '../../actions'

type Soggetto = { id: string; ragione_sociale: string }

export function CreaTitoloDialog({ soggetti }: { soggetti: Soggetto[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<'assegno' | 'cambiale'>('assegno')
  const [searchSoggetto, setSearchSoggetto] = useState('')

  const soggettoFiltrati = soggetti.filter(s =>
    s.ragione_sociale.toLowerCase().includes(searchSoggetto.toLowerCase())
  ).slice(0, 10)

  async function handleSubmit(formData: FormData) {
    formData.set('tipo', tipo)

    startTransition(async () => {
      try {
        await creaTitolo(formData)
        setIsOpen(false)
        setTipo('assegno')
        setSearchSoggetto('')
      } catch (error) {
        alert("Errore durante il salvataggio del titolo")
      }
    })
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline" className="shadow-sm">
        <Plus className="h-4 w-4 mr-2" /> Nuovo Titolo
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b shrink-0">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-600" /> Nuovo Assegno / Cambiale
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
            </div>

            <form action={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  onClick={() => setTipo('assegno')}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${tipo === 'assegno' ? 'bg-amber-50 border-amber-600 text-amber-700' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                >
                  <FileText className="h-6 w-6 mb-1" />
                  <span className="text-xs font-bold">Assegno</span>
                </div>
                <div
                  onClick={() => setTipo('cambiale')}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${tipo === 'cambiale' ? 'bg-purple-50 border-purple-600 text-purple-700' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                >
                  <Receipt className="h-6 w-6 mb-1" />
                  <span className="text-xs font-bold">Cambiale</span>
                </div>
              </div>

              {/* Importo e Numero */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="importo">Importo (€) *</Label>
                  <Input id="importo" name="importo" type="number" step="0.01" placeholder="1500.00" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero_titolo">N° Titolo</Label>
                  <Input id="numero_titolo" name="numero_titolo" placeholder="Es. 000123" />
                </div>
              </div>

              {/* Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data_scadenza">Scadenza *</Label>
                  <Input id="data_scadenza" name="data_scadenza" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_emissione">Data Emissione</Label>
                  <Input id="data_emissione" name="data_emissione" type="date" />
                </div>
              </div>

              {/* Soggetto */}
              <div className="space-y-2">
                <Label>Soggetto Emittente</Label>
                <Input
                  placeholder="Cerca soggetto..."
                  value={searchSoggetto}
                  onChange={e => setSearchSoggetto(e.target.value)}
                />
                <select
                  name="soggetto_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Nessun soggetto</option>
                  {soggettoFiltrati.map(s => (
                    <option key={s.id} value={s.id}>{s.ragione_sociale}</option>
                  ))}
                </select>
              </div>

              {/* Banca incasso */}
              <div className="space-y-2">
                <Label htmlFor="banca_incasso">Banca d&apos;Incasso</Label>
                <Input id="banca_incasso" name="banca_incasso" placeholder="Es. Intesa Sanpaolo" />
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
                <Button type="submit" disabled={isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salva {tipo === 'assegno' ? 'Assegno' : 'Cambiale'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
