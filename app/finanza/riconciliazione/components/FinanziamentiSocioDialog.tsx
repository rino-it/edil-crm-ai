'use client'

import { useState } from 'react'
import { Handshake } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function FinanziamentiSocioDialog({ movimenti }: { movimenti: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
  const formatData = (data: string) => new Date(data).toLocaleDateString('it-IT')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Card className="h-[58px] border-lime-200 bg-lime-50/30 shadow-sm cursor-pointer hover:bg-lime-100/50 transition-colors">
          <CardContent className="h-full px-3 py-2">
            <div className="h-full flex items-center justify-between gap-2">
              <CardTitle className="text-[10px] font-bold text-lime-800 uppercase flex items-center gap-1.5 leading-none">
                <Handshake size={12} /> Finanziamenti Soci
              </CardTitle>
              <div className="text-lg font-black text-lime-900 leading-none">{movimenti.length}</div>
            </div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico Finanziamenti Soci</DialogTitle>
        </DialogHeader>

        {movimenti.length === 0 ? (
          <p className="text-zinc-500 italic py-4 text-center">Nessun finanziamento soci registrato finora.</p>
        ) : (
          <div className="rounded-md border bg-white mt-4">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 text-zinc-500 border-b">
                <tr>
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium">Conto</th>
                  <th className="p-3 font-medium">Dettaglio</th>
                  <th className="p-3 font-medium">Note</th>
                  <th className="p-3 font-medium text-right">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movimenti.map(m => (
                  <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-3 whitespace-nowrap text-zinc-600">{formatData(m.data_operazione)}</td>
                    <td className="p-3 font-medium text-zinc-900">
                      {m.conti_banca?.nome_banca} <span className="text-zinc-500 font-normal">{m.conti_banca?.nome_conto}</span>
                    </td>
                    <td className="p-3 text-zinc-700 italic">{m.ai_motivo || m.motivo || m.descrizione}</td>
                    <td className="p-3 text-zinc-500 italic text-xs max-w-[180px]">
                      <span className="truncate block" title={m.note_riconciliazione || ''}>{m.note_riconciliazione || '—'}</span>
                    </td>
                    <td className={`p-3 text-right font-bold whitespace-nowrap ${m.importo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatEuro(m.importo)}
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
