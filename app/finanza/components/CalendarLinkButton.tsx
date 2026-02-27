'use client'

import { useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { riprogrammaScadenza } from '@/app/scadenze/actions'

export function CalendarLinkButton({ scadenza }: { scadenza: any }) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const defaultDate = scadenza.data_pianificata || scadenza.data_scadenza || ''
  const [nuovaData, setNuovaData] = useState(defaultDate)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nuovaData) {
      toast.error('Seleziona una data pianificata')
      return
    }

    try {
      setIsLoading(true)
      await riprogrammaScadenza(scadenza.id, nuovaData)
      toast.success('Scadenza riprogrammata con successo')
      setOpen(false)
    } catch (error) {
      console.error(error)
      toast.error('Errore durante la riprogrammazione')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:text-blue-600 hover:bg-blue-50"
          title="Riprogramma scadenza"
        >
          <CalendarClock size={16} />
        </Button>
      </DialogTrigger>

      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Riprogramma Scadenza</DialogTitle>
          <DialogDescription>
            Aggiorna la data pianificata per cashflow e alert WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Fattura / Riferimento</p>
            <p className="text-sm font-semibold">{scadenza.fattura_riferimento || 'N/D'}</p>
            <p className="text-xs text-muted-foreground">
              Scadenza fiscale: {scadenza.data_scadenza ? new Date(scadenza.data_scadenza).toLocaleDateString('it-IT') : 'N/D'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-pianificata">Nuova Data Pianificata</Label>
            <Input
              id="data-pianificata"
              type="date"
              value={nuovaData}
              onChange={(e) => setNuovaData(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading || !nuovaData} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
              Conferma e Riprogramma
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}