'use client'

import { useRef, useState } from 'react'
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

type TaskStatus = 'pending' | 'running' | 'completed' | 'error'

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

const POLL_INTERVAL_MS = 2000
const TIMEOUT_MS = 5 * 60 * 1000 // 5 minuti

function formatStatValue(key: string, value: unknown): string {
  if (typeof value === 'number' && (key.includes('importo') || key.includes('totale'))) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
  }
  return String(value)
}

function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'pending':  return 'In attesa dell\'agent...'
    case 'running':  return 'Aggiornamento...'
    default:         return 'Aggiornamento...'
  }
}

export default function SyncPipelineButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)
  const [results, setResults] = useState<StepResult[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = () => {
    if (pollRef.current)    clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    pollRef.current = null
    timeoutRef.current = null
  }

  const startPolling = (taskId: string) => {
    // Timeout globale
    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setIsRunning(false)
      setTaskStatus(null)
      toast.error('Timeout: l\'agent non ha risposto entro 5 minuti. Verifica che run_sync_agent.bat sia attivo.')
    }, TIMEOUT_MS)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/status/${taskId}`)
        if (!res.ok) return

        const data = await res.json()
        const status: TaskStatus = data.status

        setTaskStatus(status)

        if (status === 'completed') {
          stopPolling()
          setIsRunning(false)
          const stepResults: StepResult[] = data.results || []
          setResults(stepResults)
          setDialogOpen(true)
          const allOk = stepResults.every(r => r.status === 'success')
          if (allOk) {
            toast.success('Aggiornamento completato con successo')
          } else {
            toast.warning('Aggiornamento completato con errori')
          }
        } else if (status === 'error') {
          stopPolling()
          setIsRunning(false)
          setResults(data.results || null)
          setDialogOpen(true)
          toast.error(`Errore: ${data.error || 'Errore sconosciuto nell\'agent'}`)
        }
      } catch {
        // errore di rete temporaneo, riprova al prossimo poll
      }
    }, POLL_INTERVAL_MS)
  }

  const runPipeline = async () => {
    setIsRunning(true)
    setTaskStatus(null)
    setResults(null)

    try {
      const res = await fetch('/api/sync/request', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Errore creazione task')
      }

      setTaskStatus('pending')
      startPolling(data.task_id)
    } catch (err: unknown) {
      const error = err as { message?: string }
      setIsRunning(false)
      setTaskStatus(null)
      toast.error(`Errore: ${error.message || 'Errore sconosciuto'}`)
    }
  }

  const buttonLabel = isRunning && taskStatus ? statusLabel(taskStatus) : 'Aggiorna Dati'

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
            <span className="hidden sm:inline">{buttonLabel}</span>
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
