'use client'

import { useState } from 'react'
import { Plus, X, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AggiungiContoDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Per ora chiudiamo e ricarichiamo (in futuro qui chiameremo la server action)
    setIsOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="bg-zinc-900 text-white">
        <Plus className="h-4 w-4 mr-2" /> Aggiungi Conto
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="flex justify-between items-center p-4 border-b border-zinc-100">
              <h2 className="font-bold text-lg">Nuovo Conto Corrente</h2>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-700">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                <Input id="iban" name="iban" placeholder="IT..." className="font-mono" />
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Save className="h-4 w-4 mr-2" /> Salva Conto
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}