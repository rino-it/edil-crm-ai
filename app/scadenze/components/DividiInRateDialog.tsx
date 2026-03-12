'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scissors, Plus, Trash2, Loader2 } from 'lucide-react'
import { dividiInRate } from '../actions'
import { toast } from 'sonner'

interface Rata {
  importo: string
  data_scadenza: string
}

function addMonths(date: string, months: number): string {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

export function DividiInRateDialog({ scadenza }: { scadenza: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const residuo = Number(scadenza.importo_totale) - Number(scadenza.importo_pagato || 0)
  const oggi = new Date().toISOString().split('T')[0]

  const [rate, setRate] = useState<Rata[]>([
    { importo: (residuo / 2).toFixed(2), data_scadenza: addMonths(oggi, 1) },
    { importo: (residuo / 2).toFixed(2), data_scadenza: addMonths(oggi, 2) },
  ])

  const sommaRate = rate.reduce((acc, r) => acc + (parseFloat(r.importo) || 0), 0)
  const delta = residuo - sommaRate
  const isValid = rate.length >= 2
    && rate.every(r => parseFloat(r.importo) > 0 && r.data_scadenza)
    && Math.abs(delta) < 0.02

  const aggiungiRata = () => {
    const ultimaData = rate.length > 0 ? rate[rate.length - 1].data_scadenza : oggi
    setRate([...rate, {
      importo: delta > 0.01 ? delta.toFixed(2) : '0.00',
      data_scadenza: addMonths(ultimaData, 1),
    }])
  }

  const rimuoviRata = (index: number) => {
    if (rate.length <= 2) return
    setRate(rate.filter((_, i) => i !== index))
  }

  const aggiornaRata = (index: number, campo: keyof Rata, valore: string) => {
    const nuove = [...rate]
    nuove[index] = { ...nuove[index], [campo]: valore }
    setRate(nuove)
  }

  const distribuisciEquamente = () => {
    const n = rate.length
    const importoBase = Math.floor(residuo / n * 100) / 100
    const resto = Math.round((residuo - importoBase * n) * 100) / 100
    setRate(rate.map((r, i) => ({
      ...r,
      importo: (i === 0 ? importoBase + resto : importoBase).toFixed(2),
    })))
  }

  const handleSalva = () => {
    startTransition(async () => {
      try {
        await dividiInRate({
          scadenza_id: scadenza.id,
          rate: rate.map(r => ({
            importo: parseFloat(r.importo),
            data_scadenza: r.data_scadenza,
          })),
        })
        toast.success(`Scadenza divisa in ${rate.length} rate`)
        setIsOpen(false)
      } catch (err: any) {
        toast.error(err.message || 'Errore durante la divisione')
      }
    })
  }

  const formatEuro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50"
        >
          <Scissors size={12} />
          Rate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Dividi in Rate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm bg-zinc-50 p-3 rounded-lg border">
            <div>
              <div className="text-zinc-500">Residuo da dividere</div>
              <div className="text-lg font-black">{formatEuro(residuo)}</div>
            </div>
            <div className="text-right">
              <div className="text-zinc-500">{scadenza.anagrafica_soggetti?.ragione_sociale || 'N/D'}</div>
              <div className="font-mono text-xs">{scadenza.fattura_riferimento || ''}</div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Label className="text-sm font-bold">{rate.length} Rate</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={distribuisciEquamente}
              >
                Equidistribuisci
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={aggiungiRata}
              >
                <Plus size={12} /> Rata
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {rate.map((rata, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg border bg-white">
                <div className="text-xs font-bold text-zinc-400 w-6 text-center">{i + 1}</div>
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rata.importo}
                    onChange={e => aggiornaRata(i, 'importo', e.target.value)}
                    className="h-8 text-sm font-mono"
                    placeholder="Importo"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="date"
                    value={rata.data_scadenza}
                    onChange={e => aggiornaRata(i, 'data_scadenza', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-rose-500"
                  onClick={() => rimuoviRata(i)}
                  disabled={rate.length <= 2}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className={`flex justify-between items-center text-sm p-2 rounded-lg border ${
            Math.abs(delta) < 0.02
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <span>Somma rate: {formatEuro(sommaRate)}</span>
            {Math.abs(delta) >= 0.02 && (
              <span className="font-bold">Delta: {formatEuro(delta)}</span>
            )}
            {Math.abs(delta) < 0.02 && (
              <span className="font-bold">Quadra</span>
            )}
          </div>

          <Button
            onClick={handleSalva}
            disabled={!isValid || isPending}
            className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white font-bold"
          >
            {isPending ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Salvataggio...</>
            ) : (
              <>Dividi in {rate.length} Rate</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}