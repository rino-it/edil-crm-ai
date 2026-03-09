'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { RefreshCcw, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react"
import { toast } from "sonner"

interface StepResult {
  name: string
  label: string
  status: 'success' | 'error' | 'skipped'
  duration_ms: number
  data?: Record<string, unknown>
  error?: string
}

const STAT_LABELS: Record<string, string> = {
  nuove: 'Fatture nuove',
  scadenze_create: 'Scadenze create',
  scadenze_recuperate: 'Scadenze recuperate',
  skipped: 'Saltate',
  errori: 'Errori',
  orphans_found: 'Orfane trovate',
  scadenze_created: 'Scadenze create',
  errors: 'Errori',
  da_pagare: 'Da pagare',
  pagate: 'Pagate',
  uploadati: 'PDF caricati',
  matchati: 'PDF associati',
  non_matchati: 'PDF non associati',
}

function formatStatValue(key: string, value: unknown): string {
  if (typeof value === 'number' && (key.includes('importo') || key.includes('totale'))) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
  }
  return String(value)
}

export default function SyncPipelineButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<StepResult[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const runPipeline = async () => {
    setIsRunning(true)
    setResults(null)

    try {
      const res = await fetch('/api/sync/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: ['riconciliazione_xml', 'import_fatture_pdf', 'crea_scadenze_orfane'],
        }),
      })

      const data = await res.json()

      if (res.status === 429) {
        toast.warning('Sincronizzazione già in corso. Attendere il completamento.')
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Errore di rete')
      }

      setResults(data.results)
      setDialogOpen(true)

      if (data.success) {
        toast.success('Aggiornamento completato con successo')
      } else {
        toast.warning('Aggiornamento completato con errori')
      }
    } catch (err: unknown) {
      const error = err as { message?: string }
      toast.error(`Errore: ${error.message || 'Errore sconosciuto'}`)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <>
      <Button
        onClick={runPipeline}
        disabled={isRunning}
        variant="outline"
        size="sm"
        className="gap-2 shrink-0"
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Aggiornamento...</span>
          </>
        ) : (
          <>
            <RefreshCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Aggiorna Dati</span>
          </>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Risultato Aggiornamento</DialogTitle>
            <DialogDescription>
              Pipeline di sincronizzazione dati completata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {results?.map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border/60 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : r.status === 'error' ? (
                      <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-zinc-400 shrink-0" />
                    )}
                    <span className="font-medium text-sm">{r.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(r.duration_ms / 1000).toFixed(1)}s
                  </span>
                </div>

                {r.data && Object.keys(r.data).length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 ml-6 text-xs text-muted-foreground">
                    {Object.entries(r.data)
                      .filter(([k]) => !['dry_run', 'timestamp', 'errore'].includes(k))
                      .map(([k, v]) => (
                        <span key={k}>
                          {STAT_LABELS[k] || k}: <strong className="text-foreground">{formatStatValue(k, v)}</strong>
                        </span>
                      ))}
                  </div>
                )}

                {r.error && (
                  <p className="text-xs text-rose-600 ml-6 line-clamp-2">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
