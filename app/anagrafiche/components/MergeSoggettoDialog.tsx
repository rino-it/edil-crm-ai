'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Merge, Search, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cercaSoggetti, contaRiferimentiSoggetto, mergeSoggetti } from '../actions'

type Phase = 'search' | 'confirm' | 'merging' | 'done'

interface Props {
  currentId: string
  currentNome: string
}

export default function MergeSoggettoDialog({ currentId, currentNome }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('search')
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<Awaited<ReturnType<typeof cercaSoggetti>>>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<(typeof risultati)[0] | null>(null)
  const [riferimenti, setRiferimenti] = useState<Record<string, number>>({})
  const [result, setResult] = useState<{ success: boolean; error?: string; merged?: Record<string, number> } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    setPhase('search')
    setQuery('')
    setRisultati([])
    setSelected(null)
    setRiferimenti({})
    setResult(null)
  }, [])

  const handleSearch = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setRisultati([])
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const res = await cercaSoggetti(value, currentId)
      setRisultati(res)
      setSearching(false)
    }, 300)
  }

  const handleSelect = async (soggetto: (typeof risultati)[0]) => {
    setSelected(soggetto)
    setPhase('confirm')
    const counts = await contaRiferimentiSoggetto(soggetto.id)
    setRiferimenti(counts)
  }

  const handleMerge = async () => {
    if (!selected) return
    setPhase('merging')
    const res = await mergeSoggetti(currentId, selected.id)
    setResult(res)
    setPhase('done')
    if (res.success) router.refresh()
  }

  const totaleRiferimenti = Object.values(riferimenti).reduce((a, b) => a + b, 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full border-amber-200 text-amber-700 hover:bg-amber-50">
          <Merge className="mr-2 h-4 w-4" /> Unisci duplicato in questo soggetto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unisci soggetto duplicato</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-zinc-500">
          Cerca il soggetto duplicato da assorbire. Tutti i suoi riferimenti (scadenze, fatture, movimenti)
          verranno spostati su <strong>{currentNome}</strong>, poi il duplicato verra eliminato.
        </p>

        {phase === 'search' && (
          <div className="space-y-3 mt-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Cerca per ragione sociale..."
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {searching && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
                <Loader2 size={14} className="animate-spin" /> Ricerca...
              </div>
            )}

            {risultati.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {risultati.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.ragione_sociale}</p>
                      {s.partita_iva && <p className="text-xs text-zinc-400">{s.partita_iva}</p>}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {s.tipo}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {!searching && query.length >= 2 && risultati.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-4">Nessun risultato</p>
            )}
          </div>
        )}

        {phase === 'confirm' && selected && (
          <div className="space-y-4 mt-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">
                    &quot;{selected.ragione_sociale}&quot; verra eliminato
                  </p>
                  <p className="text-amber-700 mt-1">
                    {totaleRiferimenti > 0
                      ? `${totaleRiferimenti} riferimenti verranno spostati su "${currentNome}":`
                      : `Nessun riferimento da spostare. Il duplicato verra semplicemente eliminato.`
                    }
                  </p>
                </div>
              </div>

              {totaleRiferimenti > 0 && (
                <div className="grid grid-cols-2 gap-1 pl-7">
                  {Object.entries(riferimenti).map(([label, count]) => (
                    count > 0 && (
                      <p key={label} className="text-xs text-amber-700">
                        {count} {label}
                      </p>
                    )
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPhase('search'); setSelected(null) }} className="flex-1">
                Annulla
              </Button>
              <Button onClick={handleMerge} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                Conferma unione
              </Button>
            </div>
          </div>
        )}

        {phase === 'merging' && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 size={28} className="animate-spin text-amber-600" />
            <p className="text-sm text-zinc-600">Unione in corso...</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-4 mt-2">
            {result.success ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-2">
                <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-800">Unione completata</p>
                  <p className="text-green-700 mt-1">
                    &quot;{selected?.ragione_sociale}&quot; e stato assorbito in &quot;{currentNome}&quot;.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
                <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800">Errore durante l&apos;unione</p>
                  <p className="text-red-700 mt-1">{result.error}</p>
                </div>
              </div>
            )}

            <Button variant="outline" onClick={() => setOpen(false)} className="w-full">
              Chiudi
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
