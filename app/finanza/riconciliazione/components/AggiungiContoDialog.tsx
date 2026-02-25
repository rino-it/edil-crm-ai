'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { creaContoBanca } from '../actions' // Importa l'azione

export function AggiungiContoDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await creaContoBanca(formData)
        setIsOpen(false)
      } catch (error) {
        alert("Errore durante il salvataggio")
      }
    })
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="bg-zinc-900 text-white">
        <Plus className="h-4 w-4 mr-2" /> Aggiungi Conto
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="font-bold text-lg">Nuovo Conto Corrente</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
            </div>
            
            {/* L'attributo action invoca la server action */}
            <form action={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome_banca">Nome Banca *</Label>
                <Input id="nome_banca" name="nome_banca" placeholder="Es. Intesa Sanpaolo" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome_conto">Alias Conto *</Label>
                <Input id="nome_conto" name="nome_conto" placeholder="Es. Conto Operativo" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input id="iban" name="iban" placeholder="IT..." className="font-mono uppercase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saldo_iniziale">Saldo Attuale Reale (€)</Label>
                <Input id="saldo_iniziale" name="saldo_iniziale" type="number" step="0.01" placeholder="0.00" required />
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
                <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salva
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}