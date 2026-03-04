'use client'

import React, { useState, useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Check, X, Search, Loader2, AlertCircle } from 'lucide-react'
import { handleConfermaSplit } from '../actions'

interface SplitPanelProps {
  movimento: {
    id: string;
    data_operazione: string;
    descrizione: string;
    importo: number;
  };
  scadenzeAperte: Array<{
    id: string;
    fattura_riferimento?: string;
    importo_totale: number;
    importo_pagato?: number;
    tipo: 'entrata' | 'uscita';
    soggetto_id?: string;
    soggetto?: { ragione_sociale: string };
    anagrafica_soggetti?: { ragione_sociale: string };
  }>;
  open: boolean;
  onClose: () => void;
  onConfirm: (result: { success: boolean }) => void;
}

function formatEuro(val: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
}

export function SplitReconciliationPanel({ movimento, scadenzeAperte, open, onClose, onConfirm }: SplitPanelProps) {
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map())
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const importoAbs = Math.abs(movimento.importo)
  const isEntrata = movimento.importo > 0
  const direzione = isEntrata ? 'entrata' : 'uscita'

  // Filtra scadenze per direzione e testo
  const scadenzeFiltrate = useMemo(() => {
    return scadenzeAperte.filter(s => {
      if (s.tipo !== direzione) return false
      if (!searchFilter.trim()) return true
      const term = searchFilter.toLowerCase()
      const nome = (s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale || '').toLowerCase()
      const fattura = (s.fattura_riferimento || '').toLowerCase()
      return nome.includes(term) || fattura.includes(term)
    })
  }, [scadenzeAperte, direzione, searchFilter])

  const totaleAllocato = useMemo(() => {
    let tot = 0
    selectedItems.forEach(v => { tot += v })
    return tot
  }, [selectedItems])

  const differenza = importoAbs - totaleAllocato
  const isBilanciato = Math.abs(differenza) < 0.01
  const canSubmit = selectedItems.size > 0 && isBilanciato && !isSubmitting

  const toggleScadenza = (id: string, residuo: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.set(id, Math.min(residuo, Math.max(0, importoAbs - totaleAllocato + (prev.get(id) || 0))))
      }
      return next
    })
    setSubmitError(null)
  }

  const updateImporto = (id: string, value: number) => {
    setSelectedItems(prev => {
      const next = new Map(prev)
      next.set(id, value)
      return next
    })
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const allocazioni = Array.from(selectedItems.entries()).map(([scadenza_id, importo]) => ({
        scadenza_id,
        importo,
      }))

      const fd = new FormData()
      fd.set('movimento_id', movimento.id)
      fd.set('allocazioni', JSON.stringify(allocazioni))
      if (note.trim()) fd.set('note_riconciliazione', note.trim())

      const result = await handleConfermaSplit(fd)

      if ((result as any)?.error) {
        setSubmitError((result as any).error)
        setIsSubmitting(false)
        return
      }

      onConfirm({ success: true })
    } catch (err: any) {
      setSubmitError(err.message || 'Errore durante lo split')
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSearchFilter('')
    setSelectedItems(new Map())
    setNote('')
    setSubmitError(null)
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <SheetContent className="w-[500px] sm:max-w-[500px] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-base">Split Multi-Fattura</SheetTitle>
          <SheetDescription className="text-xs">
            Alloca il movimento su più fatture/scadenze
          </SheetDescription>
        </SheetHeader>

        {/* Header movimento */}
        <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-3 mt-2 shrink-0 space-y-1">
          <p className="text-[10px] text-zinc-500 font-medium uppercase">Movimento da allocare</p>
          <p className="text-xs font-mono truncate" title={movimento.descrizione}>{movimento.descrizione}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {new Date(movimento.data_operazione).toLocaleDateString('it-IT')}
            </span>
            <span className={`text-lg font-black ${isEntrata ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatEuro(importoAbs)}
            </span>
          </div>
        </div>

        {/* Note */}
        <div className="mt-3 shrink-0">
          <label className="text-xs font-medium text-zinc-600">Note (opzionale)</label>
          <Input
            placeholder="Es. Saldo fatture gennaio 2025..."
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            className="mt-1 text-xs h-8"
          />
          <p className="text-[10px] text-zinc-400 text-right mt-0.5">{note.length}/500</p>
        </div>

        {/* Ricerca */}
        <div className="relative mt-2 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Filtra per fornitore o n° fattura..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>

        {/* Lista scadenze */}
        <div className="flex-1 overflow-y-auto mt-3 -mx-1 px-1 min-h-0">
          {scadenzeFiltrate.length === 0 ? (
            <p className="text-center text-xs text-zinc-400 py-8">
              Nessuna scadenza {direzione === 'entrata' ? 'in entrata' : 'in uscita'} trovata.
            </p>
          ) : (
            <div className="space-y-1.5">
              {scadenzeFiltrate.map(s => {
                const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0)
                const isSelected = selectedItems.has(s.id)
                const allocato = selectedItems.get(s.id) || 0
                const overResiduo = allocato > residuo + 0.01
                const nome = s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale || '—'

                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-2.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'
                    }`}
                    onClick={() => toggleScadenza(s.id, residuo)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-800 truncate" title={nome}>{nome}</p>
                        <p className="text-[10px] text-zinc-500">
                          {s.fattura_riferimento || 'Senza rif.'} — Residuo: {formatEuro(residuo)}
                        </p>
                      </div>
                      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300'
                      }`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </div>

                    {/* Importo allocato (editabile) */}
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <label className="text-[10px] text-zinc-500 shrink-0">Importo:</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={residuo}
                          value={allocato || ''}
                          onChange={(e) => updateImporto(s.id, Math.max(0, Number(e.target.value) || 0))}
                          className={`h-7 text-xs w-28 ${overResiduo ? 'border-rose-400 text-rose-600' : ''}`}
                        />
                        <span className="text-[10px] text-zinc-400">/ {formatEuro(residuo)}</span>
                        {overResiduo && (
                          <span className="text-[10px] text-rose-500 flex items-center gap-0.5">
                            <AlertCircle className="h-3 w-3" /> Eccede residuo
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Riepilogo e azioni */}
        <div className="border-t border-zinc-200 pt-3 mt-3 shrink-0 space-y-3">
          {/* Barra riepilogo */}
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <span className="text-zinc-500">Allocato:</span>{' '}
              <span className="font-bold text-zinc-800">{formatEuro(totaleAllocato)}</span>
              <span className="text-zinc-400 mx-1">/</span>
              <span className="text-zinc-600">{formatEuro(importoAbs)}</span>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] border-none py-0 h-5 ${
                isBilanciato
                  ? 'bg-emerald-100 text-emerald-800'
                  : differenza > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isBilanciato
                ? '✅ Bilanciato'
                : differenza > 0
                  ? `↓ Residuo ${formatEuro(differenza)}`
                  : `↑ Eccesso ${formatEuro(Math.abs(differenza))}`}
            </Badge>
          </div>

          {selectedItems.size > 0 && (
            <p className="text-[10px] text-zinc-500">
              {selectedItems.size} fattura{selectedItems.size !== 1 ? 'e' : ''} selezionata{selectedItems.size !== 1 ? 'e' : ''}
            </p>
          )}

          {submitError && (
            <p className="text-xs text-rose-600 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {submitError}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-9" onClick={handleClose} disabled={isSubmitting}>
              <X className="h-4 w-4 mr-1" /> Annulla
            </Button>
            <Button
              className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin h-4 w-4 mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              {isSubmitting ? 'Conferma...' : 'Conferma Split'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
