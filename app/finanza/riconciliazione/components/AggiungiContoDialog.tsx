'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Save, Loader2, Landmark, CreditCard, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { creaContoBanca } from '../actions'

export function AggiungiContoDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Stato per gestire il form dinamico
  const [tipo, setTipo] = useState<'conto' | 'prepagata' | 'credito'>('conto')

  async function handleSubmit(formData: FormData) {
    // Forza il tipo nel form data prima dell'invio
    formData.append('tipo_conto', tipo)
    
    startTransition(async () => {
      try {
        await creaContoBanca(formData)
        setIsOpen(false)
        // Reset form
        setTipo('conto')
      } catch (error) {
        alert("Errore durante il salvataggio")
      }
    })
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="bg-zinc-900 text-white shadow-sm">
        <Plus className="h-4 w-4 mr-2" /> Aggiungi Conto/Carta
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="font-bold text-lg">Nuovo Strumento Finanziario</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
            </div>
            
            <form action={handleSubmit} className="p-4 space-y-5">
              
              {/* Selezione Tipo */}
              <div className="grid grid-cols-3 gap-2">
                <div onClick={() => setTipo('conto')} className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${tipo === 'conto' ? 'bg-blue-50 border-blue-600 text-blue-700' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                  <Landmark className="h-6 w-6 mb-1" />
                  <span className="text-xs font-bold text-center">Conto<br/>Corrente</span>
                </div>
                <div onClick={() => setTipo('prepagata')} className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${tipo === 'prepagata' ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                  <Wallet className="h-6 w-6 mb-1" />
                  <span className="text-xs font-bold text-center">Carta<br/>Prepagata</span>
                </div>
                <div onClick={() => setTipo('credito')} className={`flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${tipo === 'credito' ? 'bg-orange-50 border-orange-600 text-orange-700' : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                  <CreditCard className="h-6 w-6 mb-1" />
                  <span className="text-xs font-bold text-center">Carta<br/>di Credito</span>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="nome_banca">Nome Banca / Circuito *</Label>
                  <Input id="nome_banca" name="nome_banca" placeholder={tipo === 'conto' ? "Es. Intesa Sanpaolo" : "Es. Nexi, Mastercard"} required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="nome_conto">Alias / Etichetta *</Label>
                  <Input id="nome_conto" name="nome_conto" placeholder={tipo === 'conto' ? "Es. Conto Operativo" : "Es. Carta Aziendale Mario"} required />
                </div>

                {/* VISIBILE SOLO PER CONTO E PREPAGATA (Spesso le prepagate aziendali hanno IBAN) */}
                {(tipo === 'conto' || tipo === 'prepagata') && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="iban">IBAN {tipo === 'prepagata' && "(Opzionale)"}</Label>
                    <Input id="iban" name="iban" placeholder="IT..." className="font-mono uppercase" required={tipo === 'conto'} />
                  </div>
                )}

                {/* VISIBILE SOLO PER CONTO E PREPAGATA (Saldo Attuale Reale) */}
                {(tipo === 'conto' || tipo === 'prepagata') && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="saldo_iniziale">Saldo Disponibile ad Oggi (€)</Label>
                    <Input id="saldo_iniziale" name="saldo_iniziale" type="number" step="0.01" placeholder="0.00" required />
                  </div>
                )}

                {/* VISIBILE SOLO PER CARTA DI CREDITO (Plafond e Addebito) */}
                {tipo === 'credito' && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                    <div className="space-y-2">
                      <Label htmlFor="plafond">Plafond Mensile (€)</Label>
                      <Input id="plafond" name="plafond" type="number" step="0.01" placeholder="Es. 5000" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="giorno_addebito">Giorno Addebito Mese Succ.</Label>
                      <Input id="giorno_addebito" name="giorno_addebito" type="number" min="1" max="31" placeholder="Es. 15" required />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
                <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salva Strumento
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}