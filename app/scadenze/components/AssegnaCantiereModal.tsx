'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, AlertCircle, SplitSquareVertical, MapPin } from "lucide-react"
// La Server Action che creeremo nello Step 2.5
import { salvaAssegnazioneCantiere } from '../actions' 

interface Cantiere {
  id: string;
  codice: string;
  titolo: string;
}

interface AssegnaCantiereModalProps {
  scadenzaId: string;
  importoTotale: number;
  cantieri: Cantiere[];
  currentCantiereId?: string | null;
  // Per il futuro supporto DDT
  ddtSuggeriti?: { cantiere_id: string; ragione: string }[]; 
  children?: React.ReactNode; // Permette di passare un bottone custom come trigger
}

export function AssegnaCantiereModal({ 
  scadenzaId, 
  importoTotale, 
  cantieri, 
  currentCantiereId,
  ddtSuggeriti,
  children 
}: AssegnaCantiereModalProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Modalità: 'singolo' o 'multiplo'
  const [mode, setMode] = useState<'singolo' | 'multiplo'>('singolo')
  
  // Stato per la modalità Singolo
  const [singleCantiere, setSingleCantiere] = useState<string>(currentCantiereId || '')
  
  // Stato per la modalità Multiplo (array di oggetti)
  const [allocazioni, setAllocazioni] = useState<{ cantiere_id: string; importo: number }[]>([
    { cantiere_id: '', importo: importoTotale } // Parte con una riga pari al totale
  ])

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  // Calcoli in tempo reale per la validazione
  const sommaAllocata = allocazioni.reduce((acc, curr) => acc + (Number(curr.importo) || 0), 0)
  // Arrotondamento per evitare i classici bug dei float in Javascript (es. 0.1 + 0.2 = 0.300000004)
  const residuo = Math.round((importoTotale - sommaAllocata) * 100) / 100
  
  const isMultiValid = allocazioni.every(a => a.cantiere_id !== '' && a.importo > 0) && residuo === 0

  const handleAddRiga = () => {
    setAllocazioni([...allocazioni, { cantiere_id: '', importo: Math.max(0, residuo) }])
  }

  const handleRemoveRiga = (index: number) => {
    setAllocazioni(allocazioni.filter((_, i) => i !== index))
  }

  const handleChangeRiga = (index: number, field: 'cantiere_id' | 'importo', value: any) => {
    const nuoveAllocazioni = [...allocazioni]
    if (field === 'importo') {
      nuoveAllocazioni[index].importo = value === '' ? 0 : parseFloat(value)
    } else {
      nuoveAllocazioni[index].cantiere_id = value
    }
    setAllocazioni(nuoveAllocazioni)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const data = mode === 'singolo' 
        ? { mode: 'singolo', cantiere_id: singleCantiere }
        : { mode: 'multiplo', allocazioni }

      await salvaAssegnazioneCantiere(scadenzaId, data)
      setIsOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Errore salvataggio:", error)
      alert("Si è verificato un errore durante il salvataggio.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-dashed">
            <MapPin className="h-3 w-3 mr-1.5" /> 
            {currentCantiereId ? 'Modifica Cantiere' : 'Assegna Cantiere'}
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[600px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Assegnazione Cantiere</DialogTitle>
          <DialogDescription>
            Associa questa scadenza da <strong className="text-zinc-900">{formatEuro(importoTotale)}</strong> a uno o più cantieri.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Selettore Modalità */}
          <div className="flex p-1 bg-zinc-100 rounded-lg">
            <button
              onClick={() => setMode('singolo')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'singolo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              Cantiere Singolo
            </button>
            <button
              onClick={() => setMode('multiplo')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'multiplo' ? 'bg-white shadow text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
            >
              <SplitSquareVertical size={16} /> Dividi Importo
            </button>
          </div>

          {/* VISTA: SINGOLO */}
          {mode === 'singolo' && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-700">Seleziona il cantiere di riferimento</label>
              <select
                value={singleCantiere}
                onChange={(e) => setSingleCantiere(e.target.value)}
                className="w-full h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">-- Nessun cantiere (Da Smistare) --</option>
                {cantieri.map(c => (
                  <option key={c.id} value={c.id}>{c.codice} - {c.titolo}</option>
                ))}
              </select>
            </div>
          )}

          {/* VISTA: MULTIPLO */}
          {mode === 'multiplo' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {allocazioni.map((allocazione, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <select
                        value={allocazione.cantiere_id}
                        onChange={(e) => handleChangeRiga(index, 'cantiere_id', e.target.value)}
                        className={`w-full h-10 rounded-md border ${!allocazione.cantiere_id ? 'border-rose-300 bg-rose-50' : 'border-zinc-200'} bg-white px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none`}
                      >
                        <option value="">-- Seleziona Cantiere --</option>
                        {cantieri.map(c => (
                          <option key={c.id} value={c.id}>{c.codice} - {c.titolo}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={allocazione.importo || ''}
                        onChange={(e) => handleChangeRiga(index, 'importo', e.target.value)}
                        className="pl-7 pr-2 font-mono text-right border-zinc-200"
                      />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-zinc-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"
                      onClick={() => handleRemoveRiga(index)}
                      disabled={allocazioni.length === 1}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={handleAddRiga} className="w-full border-dashed text-blue-600 border-blue-200 hover:bg-blue-50">
                <Plus size={16} className="mr-2" /> Aggiungi Cantiere
              </Button>

              {/* Riquadro di validazione Totali */}
              <div className={`p-4 rounded-lg border ${residuo === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-zinc-600">Totale Fattura:</span>
                  <span className="font-mono font-bold">{formatEuro(importoTotale)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-zinc-600">Assegnato:</span>
                  <span className="font-mono">{formatEuro(sommaAllocata)}</span>
                </div>
                <div className="border-t border-zinc-200/50 my-2 pt-2 flex justify-between items-center">
                  <span className={`text-sm font-bold ${residuo === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Da Assegnare:</span>
                  <span className={`font-mono font-black ${residuo === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatEuro(residuo)}
                  </span>
                </div>
                {residuo !== 0 && (
                  <div className="mt-2 text-xs text-rose-600 flex items-center gap-1.5">
                    <AlertCircle size={14} /> L'importo assegnato deve corrispondere esattamente al totale.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alert DDT (Placeholder UI per future integrazioni) */}
          {ddtSuggeriti && ddtSuggeriti.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>Suggerimento AI:</strong> Abbiamo rilevato DDT associati a questa fattura. 
                Ti suggeriamo di assegnarla al cantiere {cantieri.find(c => c.id === ddtSuggeriti[0].cantiere_id)?.codice || 'selezionato'}.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Annulla</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || (mode === 'multiplo' && !isMultiValid)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? 'Salvataggio...' : 'Salva Assegnazione'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}