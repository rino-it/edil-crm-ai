'use client'

import { useState, useTransition, useRef } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, CalendarPlus, ArrowRight, FileText, Loader2, Pencil, Check, X } from "lucide-react"
import Link from "next/link"
import { ScadenzaWithSoggetto } from "@/types/finanza"
import { PaginatedResult } from "@/types/pagination"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { CalendarLinkButton } from "@/app/finanza/components/CalendarLinkButton"
import { IncassoManualeDialog } from "./IncassoManualeDialog"
import { aggiornaFatturaRiferimento, assegnaCantiereAScadenza } from '../actions'
import { toast } from 'sonner'

interface ScadenzeTableProps {
  data: ScadenzaWithSoggetto[];
  pagination: PaginatedResult<any>;
  showCantiereColumn?: boolean;
  showPagamentoActions?: boolean;
  cantieri?: { id: string; label: string }[];
}

// ─── Fattura: badge cliccabile → input inline ─────────────────
function FatturaEditCell({ scadenzaId, initial, fileUrl }: { scadenzaId: string; initial: string | null; fileUrl: string | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial || '')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (newVal: string) => {
    setEditing(false)
    if (newVal === (initial || '')) return
    setValue(newVal)
    startTransition(async () => {
      try {
        await aggiornaFatturaRiferimento(scadenzaId, newVal || null)
        toast.success('Fattura aggiornata')
      } catch {
        setValue(initial || '')
        toast.error('Errore aggiornamento fattura')
      }
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          autoFocus
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit(value)
            if (e.key === 'Escape') { setEditing(false); setValue(initial || '') }
          }}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full max-w-[100px] font-mono"
          placeholder="N. fattura..."
        />
        <button onClick={() => commit(value)} className="text-emerald-500 hover:text-emerald-700" title="Conferma"><Check size={12} /></button>
        <button onClick={() => { setEditing(false); setValue(initial || '') }} className="text-zinc-400 hover:text-zinc-600" title="Annulla"><X size={12} /></button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
      {isPending ? (
        <Loader2 size={11} className="animate-spin text-zinc-400" />
      ) : null}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-all inline-flex items-center gap-1 ${
          value
            ? 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 cursor-pointer'
        }`}
        title="Clicca per modificare fattura"
      >
        {value || 'Inserisci'}
        <Pencil size={9} className="opacity-50" />
      </button>
    </div>
  )
}

// ─── Cantiere: dropdown sempre visibile (stile AssegnaCantiereSelect) ────
function CantiereDropdown({ scadenzaId, currentCantiereId, cantieri }: { scadenzaId: string; currentCantiereId: string | null; cantieri: { id: string; label: string }[] }) {
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState(currentCantiereId || 'null')

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value
    setSelectedId(newId)
    startTransition(async () => {
      try {
        await assegnaCantiereAScadenza(scadenzaId, newId)
        toast.success(newId === 'null' ? 'Cantiere rimosso' : 'Cantiere assegnato')
      } catch {
        setSelectedId(currentCantiereId || 'null')
        toast.error('Errore assegnazione cantiere')
      }
    })
  }

  const isAssigned = selectedId !== 'null'

  return (
    <select
      disabled={isPending}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded w-full max-w-[130px] border outline-none transition-all ${
        isPending ? 'opacity-40' : ''
      } ${
        isAssigned
          ? 'bg-blue-50 text-blue-600 border-blue-200'
          : 'bg-amber-50 text-amber-600 border-amber-200 cursor-pointer hover:bg-amber-100'
      }`}
      value={selectedId}
      onChange={handleChange}
    >
      <option value="null">🏗️ Assegna cantiere...</option>
      {cantieri.map(c => (
        <option key={c.id} value={c.id}>
          {c.label.length > 25 ? c.label.substring(0, 25) + '...' : c.label}
        </option>
      ))}
    </select>
  )
}

export function ScadenzeTable({ 
  data, 
  pagination, 
  showCantiereColumn = true, 
  showPagamentoActions = true,
  cantieri = [],
}: ScadenzeTableProps) {
  
  const formatEuro = (val: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  const CATEGORIA_LABELS: Record<string, string> = {
    utenza: 'Utenza',
    multa: 'Multa',
    sanzione: 'Sanzione',
    burocrazia: 'Tasse',
    ufficio: 'Ufficio',
    rata_mutuo: 'Rata Mutuo',
    titolo: 'Titolo',
  };
  const CATEGORIA_COLORS: Record<string, string> = {
    utenza: 'border-yellow-300 bg-yellow-50 text-yellow-700',
    multa: 'border-red-300 bg-red-50 text-red-700',
    sanzione: 'border-red-300 bg-red-50 text-red-700',
    burocrazia: 'border-purple-300 bg-purple-50 text-purple-700',
    ufficio: 'border-blue-300 bg-blue-50 text-blue-700',
    rata_mutuo: 'border-indigo-300 bg-indigo-50 text-indigo-700',
    titolo: 'border-amber-300 bg-amber-50 text-amber-700',
  };

  if (data.length === 0) {
    return (
      <div className="p-12 text-center text-zinc-500 bg-white rounded-xl border border-zinc-200">
        Nessuna scadenza trovata per i filtri selezionati.
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
      
      {/* VISTA DESKTOP: Tabella classica */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-zinc-50/80">
            <TableRow>
              <TableHead className="font-semibold">Soggetto</TableHead>
              <TableHead className="font-semibold w-[120px]">Fattura / Rif.</TableHead>
              {showCantiereColumn && <TableHead className="font-semibold w-[150px]">Cantiere</TableHead>}
              <TableHead className="text-right font-semibold w-[95px]">Totale</TableHead>
              <TableHead className="text-right font-semibold w-[95px]">Residuo</TableHead>
              <TableHead className="font-semibold w-[85px]">Scadenza</TableHead>
              <TableHead className="font-semibold w-[80px]">Stato</TableHead>
              <TableHead className="text-center font-semibold w-[36px]" title="Allegato PDF">FT</TableHead>
              <TableHead className="text-center font-semibold w-[36px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => {
              const importoResiduo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
              const isScaduta = new Date(s.data_scadenza) < new Date() && s.stato !== 'pagato';
              const attachmentUrl = s.file_url ?? s.titolo?.file_url ?? null;
              const attachmentTitle = s.file_url
                ? 'Apri fattura PDF'
                : s.titolo?.file_url
                  ? `Apri allegato titolo ${s.titolo.tipo ?? ''}`.trim()
                  : '';

              return (
                <TableRow key={s.id} className="group hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="font-bold text-zinc-900">
                    <div className="space-y-1">
                      <div className="truncate max-w-[200px]">{s.anagrafica_soggetti?.ragione_sociale || s.descrizione || 'N/D'}</div>
                      {(s.categoria || (s as any).auto_domiciliazione) && (
                        <div className="flex flex-wrap gap-1">
                          {s.categoria && (
                            <Badge variant="outline" className={`text-[10px] ${CATEGORIA_COLORS[s.categoria] || 'border-zinc-300 bg-zinc-50 text-zinc-600'}`}>
                              {CATEGORIA_LABELS[s.categoria] || s.categoria}
                            </Badge>
                          )}
                          {(s as any).auto_domiciliazione && (
                            <Badge variant="outline" className="text-[10px] border-cyan-300 bg-cyan-50 text-cyan-700">
                              SDD
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell className="text-xs font-mono text-zinc-600">
                    <FatturaEditCell scadenzaId={s.id} initial={s.fattura_riferimento ?? null} fileUrl={s.file_url ?? null} />
                  </TableCell>
                  
                  {showCantiereColumn && (
                    <TableCell className="text-xs text-zinc-600">
                      {cantieri.length > 0 ? (
                        <CantiereDropdown scadenzaId={s.id} currentCantiereId={s.cantiere_id ?? null} cantieri={cantieri} />
                      ) : (
                        <span className="truncate block">{s.cantieri ? `${s.cantieri.codice} - ${s.cantieri.nome}` : <span className="text-zinc-400 italic">Non assegnato</span>}</span>
                      )}
                    </TableCell>
                  )}
                  
                  <TableCell className="text-right font-mono font-medium">
                    {formatEuro(Number(s.importo_totale))}
                  </TableCell>
                  
                  <TableCell className={`text-right font-black ${importoResiduo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatEuro(importoResiduo)}
                  </TableCell>
                  
                  <TableCell className="text-sm font-medium">
                    {new Date(s.data_scadenza).toLocaleDateString('it-IT')}
                  </TableCell>
                  
                  <TableCell>
                    <Badge variant="outline" className={`
                      ${s.stato === 'pagato' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                      ${isScaduta ? 'bg-rose-50 text-rose-700 border-rose-200' : ''}
                      ${s.stato === 'parziale' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                    `}>
                      {isScaduta && s.stato !== 'pagato' ? 'SCADUTA' : s.stato.toUpperCase().replace('_', ' ')}
                    </Badge>
                  </TableCell>

                  {/* Colonna FT - allegato PDF */}
                  <TableCell className="text-center px-1">
                    {attachmentUrl ? (
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={attachmentTitle}
                        className="inline-flex items-center justify-center size-7 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                      >
                        <FileText size={13} />
                      </a>
                    ) : (
                      <span className="text-zinc-200 text-[10px]">—</span>
                    )}
                  </TableCell>

                  {/* Colonna Azione: solo calendario */}
                  <TableCell className="text-center px-1">
                    {s.data_scadenza ? (
                      <CalendarLinkButton scadenza={s} />
                    ) : (
                      <button
                        disabled
                        className="inline-flex items-center justify-center size-7 rounded-md text-zinc-300 cursor-not-allowed"
                        title="Data scadenza mancante"
                      >
                        <CalendarPlus size={13} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* VISTA MOBILE: Cards */}
      <div className="md:hidden divide-y divide-zinc-100">
        {data.map((s) => {
          const importoResiduo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
          const isScaduta = new Date(s.data_scadenza) < new Date() && s.stato !== 'pagato';
          const attachmentUrl = s.file_url ?? s.titolo?.file_url ?? null;
          const attachmentTitle = s.file_url
            ? 'Apri fattura PDF'
            : s.titolo?.file_url
              ? `Apri allegato titolo ${s.titolo.tipo ?? ''}`.trim()
              : '';

          return (
            <div key={s.id} className="p-4 space-y-4 bg-white hover:bg-zinc-50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="space-y-1 max-w-[65%]">
                  <div className="font-black text-zinc-900 text-sm leading-tight uppercase truncate">
                    {s.anagrafica_soggetti?.ragione_sociale || 'N/D'}
                  </div>
                  {(s.categoria || (s as any).auto_domiciliazione) && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {s.categoria && (
                        <Badge variant="outline" className={`text-[10px] ${CATEGORIA_COLORS[s.categoria] || 'border-zinc-300 bg-zinc-50 text-zinc-600'}`}>
                          {CATEGORIA_LABELS[s.categoria] || s.categoria}
                        </Badge>
                      )}
                      {(s as any).auto_domiciliazione && (
                        <Badge variant="outline" className="text-[10px] border-cyan-300 bg-cyan-50 text-cyan-700">SDD</Badge>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
                    <FatturaEditCell scadenzaId={s.id} initial={s.fattura_riferimento ?? null} fileUrl={s.file_url ?? null} />
                    {attachmentUrl && (
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={attachmentTitle}
                        className="inline-flex items-center justify-center size-5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors flex-shrink-0"
                      >
                        <FileText size={10} />
                      </a>
                    )}
                  </div>
                  {showCantiereColumn && (
                    <div className="mt-1">
                      {cantieri.length > 0 ? (
                        <CantiereDropdown scadenzaId={s.id} currentCantiereId={s.cantiere_id ?? null} cantieri={cantieri} />
                      ) : (
                        <div className="text-xs text-zinc-600 truncate">
                          📍 {s.cantieri ? `${s.cantieri.codice} - ${s.cantieri.nome}` : 'Non assegnato'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-zinc-900">{formatEuro(Number(s.importo_totale))}</div>
                  <Badge variant="outline" className={`mt-1 text-[9px] h-5 ${isScaduta ? 'border-rose-200 text-rose-600 bg-rose-50' : ''}`}>
                    {isScaduta && s.stato !== 'pagato' ? 'SCADUTA' : s.stato.toUpperCase().replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                <div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase">Scadenza</div>
                  <div className="text-sm font-bold text-zinc-700">
                    {new Date(s.data_scadenza).toLocaleDateString('it-IT')}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase">Residuo</div>
                  <div className={`text-sm font-black ${importoResiduo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatEuro(importoResiduo)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {attachmentUrl && (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={attachmentTitle}
                    className="inline-flex items-center justify-center h-11 w-12 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                  >
                    <FileText size={16} />
                  </a>
                )}
                {showPagamentoActions && s.stato !== 'pagato' && (
                  s.tipo === 'entrata' ? (
                    <div className="flex-1">
                      <IncassoManualeDialog scadenza={s} />
                    </div>
                  ) : (
                    <Link href={`?pagamento_id=${s.id}`} className="flex-1">
                      <Button className="w-full h-11 bg-blue-600 font-bold rounded-xl shadow-md shadow-blue-100">
                        Registra <ArrowRight size={16} className="ml-2" />
                      </Button>
                    </Link>
                  )
                )}
                {s.data_scadenza && (
                  <div className="flex items-center">
                    <CalendarLinkButton scadenza={s} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* PAGINAZIONE CONDIVISA (FOOTER) */}
      <div className="border-t border-zinc-200 bg-zinc-50/50">
        <PaginationControls 
          totalCount={pagination.totalCount}
          currentPage={pagination.page}
          pageSize={pagination.pageSize}
          totalPages={pagination.totalPages}
        />
      </div>

    </div>
  )
}