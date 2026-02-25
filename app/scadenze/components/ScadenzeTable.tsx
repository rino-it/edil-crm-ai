'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MoreHorizontal, MessageCircle, CalendarPlus, ArrowRight } from "lucide-react"
import Link from "next/link"
import { ScadenzaWithSoggetto } from "@/types/finanza"
import { PaginatedResult } from "@/types/pagination"
import { PaginationControls } from "@/components/ui/pagination-controls"

interface ScadenzeTableProps {
  data: ScadenzaWithSoggetto[];
  pagination: PaginatedResult<any>;
  showCantiereColumn?: boolean;
  showPagamentoActions?: boolean;
}

export function ScadenzeTable({ 
  data, 
  pagination, 
  showCantiereColumn = true, 
  showPagamentoActions = true 
}: ScadenzeTableProps) {
  
  const formatEuro = (val: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

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
              <TableHead className="font-semibold">Fattura / Rif.</TableHead>
              {showCantiereColumn && <TableHead className="font-semibold">Cantiere</TableHead>}
              <TableHead className="text-right font-semibold">Totale</TableHead>
              <TableHead className="text-right font-semibold">Residuo</TableHead>
              <TableHead className="font-semibold">Scadenza</TableHead>
              <TableHead className="font-semibold">Stato</TableHead>
              <TableHead className="text-right font-semibold">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => {
              const importoResiduo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
              const isScaduta = new Date(s.data_scadenza) < new Date() && s.stato !== 'pagato';

              return (
                <TableRow key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="font-bold text-zinc-900">
                    {s.anagrafica_soggetti?.ragione_sociale || 'N/D'}
                  </TableCell>
                  
                  <TableCell className="text-xs font-mono text-zinc-600">
                    {s.fattura_riferimento || '-'}
                  </TableCell>
                  
                  {showCantiereColumn && (
                    <TableCell className="text-xs text-zinc-600 truncate max-w-[150px]">
                      {s.cantieri ? `${s.cantieri.codice} - ${s.cantieri.titolo}` : <span className="text-zinc-400 italic">Non assegnato</span>}
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
                  
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* Placeholder per Calendar & WhatsApp - Li attiveremo in Fase 3 */}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-blue-600" title="Aggiungi a Calendario">
                        <CalendarPlus size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-green-600" title="Invia Sollecito WhatsApp">
                        <MessageCircle size={16} />
                      </Button>
                      
                      {showPagamentoActions && s.stato !== 'pagato' && (
                        <Link href={`?pagamento_id=${s.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50">
                            <CheckCircle2 size={14} className="mr-1.5" /> Paga
                          </Button>
                        </Link>
                      )}
                    </div>
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

          return (
            <div key={s.id} className="p-4 space-y-4 bg-white hover:bg-zinc-50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="space-y-1 max-w-[65%]">
                  <div className="font-black text-zinc-900 text-sm leading-tight uppercase truncate">
                    {s.anagrafica_soggetti?.ragione_sociale || 'N/D'}
                  </div>
                  <div className="text-xs text-zinc-500 font-mono">
                    Fattura: {s.fattura_riferimento || '-'}
                  </div>
                  {showCantiereColumn && (
                    <div className="text-xs text-zinc-600 truncate mt-1">
                      📍 {s.cantieri ? s.cantieri.codice : 'Cantiere N/D'}
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
                  <div className="text-[9px] font-bold text-zinc-400 uppercase">Residuo</div>
                  <div className={`text-sm font-black ${importoResiduo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatEuro(importoResiduo)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase">Scadenza</div>
                  <div className="text-sm font-bold text-zinc-700">
                    {new Date(s.data_scadenza).toLocaleDateString('it-IT')}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {showPagamentoActions && s.stato !== 'pagato' && (
                  <Link href={`?pagamento_id=${s.id}`} className="flex-1">
                    <Button className="w-full h-11 bg-blue-600 font-bold rounded-xl shadow-md shadow-blue-100">
                      Registra <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </Link>
                )}
                <Button variant="outline" className="h-11 w-12 rounded-xl border-zinc-200">
                  <MoreHorizontal size={18} className="text-zinc-400" />
                </Button>
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