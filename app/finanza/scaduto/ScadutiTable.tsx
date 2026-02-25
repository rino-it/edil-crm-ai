'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageCircle, Phone, ArrowRight } from "lucide-react"
import Link from "next/link"
import { ScadenzaWithSoggetto } from "@/types/finanza"
import { PaginatedResult } from "@/types/pagination"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { inviaReminderWhatsApp } from "@/app/scadenze/actions"

export function ScadutiTable({ 
  data, 
  pagination, 
  tipo 
}: { 
  data: ScadenzaWithSoggetto[]; 
  pagination: PaginatedResult<any>;
  tipo: 'crediti' | 'debiti';
}) {
  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  // Funzione per calcolare i giorni di ritardo e il colore
  const getAgingInfo = (dataScadenza: string) => {
    const ggRitardo = Math.floor((new Date().getTime() - new Date(dataScadenza).getTime()) / (1000 * 3600 * 24));
    
    if (ggRitardo > 60) return { giorni: ggRitardo, badge: 'bg-red-100 text-red-800 border-red-200', label: 'Critico' };
    if (ggRitardo > 30) return { giorni: ggRitardo, badge: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Grave' };
    return { giorni: ggRitardo, badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Recente' };
  };

  const handleSollecito = async (scadenzaId: string, livello: string) => {
    await inviaReminderWhatsApp(scadenzaId);
    alert(`Sollecito (Livello: ${livello}) preparato per l'invio via WhatsApp.`);
  };

  if (data.length === 0) {
    return <div className="p-12 text-center text-zinc-500 bg-white rounded-xl border border-zinc-200">Nessuna posizione scaduta trovata.</div>;
  }

  return (
    <div className="bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-zinc-50/80">
            <TableRow>
              <TableHead className="font-semibold">Soggetto</TableHead>
              <TableHead className="font-semibold">Documento</TableHead>
              <TableHead className="font-semibold text-center">Ritardo</TableHead>
              <TableHead className="text-right font-semibold">Importo Scoperto</TableHead>
              <TableHead className="text-right font-semibold">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => {
              const importoResiduo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
              const aging = getAgingInfo(s.data_scadenza);

              return (
                <TableRow key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                  <TableCell className="font-bold text-zinc-900">{s.anagrafica_soggetti?.ragione_sociale || 'N/D'}</TableCell>
                  <TableCell className="text-xs font-mono text-zinc-600">{s.fattura_riferimento || '-'}</TableCell>
                  
                  {/* Colonna Aging */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-black text-sm">{aging.giorni} gg</span>
                      <Badge variant="outline" className={`text-[10px] h-5 ${aging.badge}`}>
                        {aging.label}
                      </Badge>
                    </div>
                  </TableCell>
                  
                  <TableCell className={`text-right font-black text-lg ${tipo === 'crediti' ? 'text-red-600' : 'text-orange-600'}`}>
                    {formatEuro(importoResiduo)}
                  </TableCell>
                  
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {tipo === 'crediti' ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => handleSollecito(s.id, aging.label)}
                        >
                          <MessageCircle size={14} className="mr-1.5" /> Sollecita
                        </Button>
                      ) : (
                        <Link href={`/scadenze?pagamento_id=${s.id}`}>
                          <Button variant="outline" size="sm" className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50">
                            <ArrowRight size={14} className="mr-1.5" /> Vai a Pagamento
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
      <div className="border-t border-zinc-200 bg-zinc-50/50">
        <PaginationControls totalCount={pagination.totalCount} currentPage={pagination.page} pageSize={pagination.pageSize} totalPages={pagination.totalPages} />
      </div>
    </div>
  )
}