'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, Pencil, AlertTriangle, ArrowRight } from 'lucide-react'
import type { AnteprimaRiconciliazione } from '../actions'

const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

const BADGE_TIPO: Record<string, { label: string; className: string }> = {
  scadenza: { label: 'Pagamento Fattura', className: 'bg-blue-50 text-blue-700' },
  soggetto_allocazione: { label: 'Allocazione Automatica', className: 'bg-violet-50 text-violet-700' },
  titolo: { label: 'Titolo (Cambiale/Assegno)', className: 'bg-amber-50 text-amber-700' },
  categoria_speciale: { label: 'Categoria Speciale', className: 'bg-zinc-100 text-zinc-700' },
  nota_credito: { label: 'Nota di Credito', className: 'bg-orange-50 text-orange-700' },
  fallback_soggetto: { label: 'Soggetto Identificato', className: 'bg-sky-50 text-sky-700' },
  nessun_match: { label: 'Nessun Match', className: 'bg-rose-50 text-rose-700' },
}

interface Props {
  open: boolean
  anteprima: AnteprimaRiconciliazione | null
  loading: boolean
  onConferma: () => void
  onAnnulla: () => void
  onModifica: () => void
}

export function AnteprimaRiconciliazioneDialog({ open, anteprima, loading, onConferma, onAnnulla, onModifica }: Props) {
  if (!anteprima) return null

  const badge = BADGE_TIPO[anteprima.tipo] || BADGE_TIPO.nessun_match

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onAnnulla() }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base">Anteprima Riconciliazione</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Badge tipo + nota credito */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`${badge.className} border-none`}>
              {badge.label}
            </Badge>
            {anteprima.isNotaCredito && (
              <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 font-semibold">
                NOTA DI CREDITO
              </Badge>
            )}
            {anteprima.categoria && (
              <Badge variant="outline" className="text-zinc-500 border-zinc-200 text-xs">
                {anteprima.categoria}
              </Badge>
            )}
          </div>

          {/* Importo movimento */}
          <div className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
            <span className="text-xs text-zinc-500">Importo movimento</span>
            <span className={`text-sm font-bold ${anteprima.importo_movimento > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatEuro(anteprima.importo_movimento)}
            </span>
          </div>

          {/* Soggetto */}
          {anteprima.soggetto && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Soggetto</span>
              <span className="text-sm font-semibold">{anteprima.soggetto.ragione_sociale}</span>
            </div>
          )}

          {/* Descrizione */}
          <p className="text-sm text-zinc-700 leading-relaxed">{anteprima.label}</p>

          {/* Dettaglio scadenza */}
          {anteprima.scadenza && (
            <div className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Fattura</span>
                <span className="font-medium">{anteprima.scadenza.fattura_riferimento || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Importo fattura</span>
                <span className="font-medium">{formatEuro(anteprima.scadenza.importo_totale)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Residuo</span>
                <div className="flex items-center gap-1 ml-auto">
                  <span className="font-medium text-zinc-600">{formatEuro(anteprima.scadenza.residuo_prima)}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-400" />
                  <span className={`font-bold ${anteprima.scadenza.residuo_dopo <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {formatEuro(anteprima.scadenza.residuo_dopo)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Stato</span>
                <Badge variant="outline" className={`text-[10px] py-0 border-none ${anteprima.scadenza.stato_dopo === 'pagato' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {anteprima.scadenza.stato_dopo}
                </Badge>
              </div>
            </div>
          )}

          {/* Dettaglio titolo */}
          {anteprima.titolo && (
            <div className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Tipo</span>
                <span className="font-medium capitalize">{anteprima.titolo.tipo}</span>
              </div>
              {anteprima.titolo.numero_titolo && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Numero</span>
                  <span className="font-medium">{anteprima.titolo.numero_titolo}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Importo titolo</span>
                <span className="font-medium">{formatEuro(anteprima.titolo.importo)}</span>
              </div>
            </div>
          )}

          {/* Allocazione FIFO */}
          {anteprima.allocazione_fifo && anteprima.allocazione_fifo.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-100">
                <span className="text-xs font-medium text-zinc-600">
                  Allocazione su {anteprima.allocazione_fifo.length} fattur{anteprima.allocazione_fifo.length === 1 ? 'a' : 'e'}
                </span>
              </div>
              <div className="divide-y divide-zinc-100 max-h-[200px] overflow-y-auto">
                {anteprima.allocazione_fifo.map((a, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-600 truncate max-w-[150px]">
                      {a.fattura_riferimento || `Scadenza ${i + 1}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">{formatEuro(a.residuo_prima)}</span>
                      <ArrowRight className="h-3 w-3 text-zinc-400" />
                      <span className={`font-medium ${a.residuo_dopo <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {formatEuro(a.residuo_dopo)}
                      </span>
                      <span className="text-zinc-400 ml-1">({formatEuro(a.importo_applicato)})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          {anteprima.warning && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-800">{anteprima.warning}</span>
            </div>
          )}
        </div>

        {/* Footer: 3 bottoni */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onAnnulla} disabled={loading}>
            <X className="h-4 w-4 mr-1" /> Annulla
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={onModifica} disabled={loading}>
            <Pencil className="h-4 w-4 mr-1" /> Modifica
          </Button>
          <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onConferma} disabled={loading}>
            {loading ? (
              <span className="animate-pulse">Elaborazione...</span>
            ) : (
              <><Check className="h-4 w-4 mr-1" /> Conferma</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
