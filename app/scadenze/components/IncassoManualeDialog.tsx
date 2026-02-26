'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, Loader2, Landmark } from 'lucide-react'
import { registraIncassoFattura } from '../actions'
import { createClient } from '@/utils/supabase/client'

type Conto = {
  id: string
  nome_banca: string
  nome_conto: string
}

export function IncassoManualeDialog({ scadenza }: { scadenza: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [conti, setConti] = useState<Conto[]>([])

  const [contoSelezionato, setContoSelezionato] = useState('')
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [metodo, setMetodo] = useState('bonifico')

  // Carica i conti banca reali dal database all'apertura
  useEffect(() => {
    if (isOpen) {
      const fetchConti = async () => {
        const supabase = createClient()
        const { data } = await supabase
          .from('conti_banca')
          .select('id, nome_banca, nome_conto')
          .eq('attivo', true)

        setConti((data as Conto[]) || [])
      }
      fetchConti()
    }
  }, [isOpen])

  async function handleIncasso(e: React.FormEvent) {
    e.preventDefault()
    if (!contoSelezionato) return alert('Seleziona un conto bancario')

    setIsLoading(true)
    try {
      await registraIncassoFattura(scadenza.id, contoSelezionato, dataPagamento, metodo)
      setIsOpen(false)
    } catch (error) {
      console.error(error)
      alert("Errore durante l'incasso")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
          <CheckCircle size={14} className="mr-2" /> Incassa
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Registra Incasso: {scadenza.fattura_riferimento || 'Fattura'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleIncasso} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Conto di Accredito (Aumenterà il saldo)</Label>
            <Select value={contoSelezionato} onValueChange={setContoSelezionato} required>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona la banca..." />
              </SelectTrigger>
              <SelectContent>
                {conti.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_banca} - {c.nome_conto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Accredito</Label>
              <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Metodo</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonifico">Bonifico</SelectItem>
                  <SelectItem value="rid">RID / SDD</SelectItem>
                  <SelectItem value="assegno">Assegno</SelectItem>
                  <SelectItem value="contanti">Contanti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={isLoading || !contoSelezionato} className="w-full bg-emerald-600 hover:bg-emerald-700 mt-4">
            {isLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Landmark className="mr-2" size={16} />}
            Conferma e Aggiorna Saldo
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
