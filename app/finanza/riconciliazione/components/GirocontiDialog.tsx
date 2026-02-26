'use client'

import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GirocontiDialog({ giroconti }: { giroconti: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
  const formatData = (data: string) => new Date(data).toLocaleDateString('it-IT')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Card className="border-indigo-200 bg-indigo-50/30 shadow-sm cursor-pointer hover:bg-indigo-100/50 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-indigo-800 uppercase flex items-center gap-2">
              <ArrowRightLeft size={14} /> Giroconti / Carte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-indigo-900">{giroconti.length} <span className="text-sm font-medium">storico</span></div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico Giri di Liquidità (Giroconti e Ricariche Carte)</DialogTitle>
        </DialogHeader>

        {giroconti.length === 0 ? (
          <p className="text-zinc-500 italic py-4 text-center">Nessun giroconto registrato finora.</p>
        ) : (
          <div className="rounded-md border bg-white mt-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-zinc-500 border-b">
                <tr>
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium">Conto Origine</th>
                  <th className="p-3 font-medium">Dettaglio (Dedotto dal sistema)</th>
                  <th className="p-3 font-medium text-right">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {giroconti.map(g => (
                  <tr key={g.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-3 whitespace-nowrap text-zinc-600">{formatData(g.data_operazione)}</td>
                    <td className="p-3 font-medium text-zinc-900">
                      {g.conti_banca?.nome_banca} <span className="text-zinc-500 font-normal">{g.conti_banca?.nome_conto}</span>
                    </td>
                    <td className="p-3 text-zinc-700 italic">{g.ai_motivo || g.motivo || g.descrizione}</td>
                    <td className={`p-3 text-right font-bold whitespace-nowrap ${g.importo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatEuro(g.importo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
