'use client'

import { FileText, Receipt, CheckCircle2, Clock, AlertTriangle, Ban, CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Titolo } from '@/types/finanza'

const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)
const formatData = (data: string) => new Date(data).toLocaleDateString('it-IT')

const statoBadge: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  in_essere: { label: 'In essere', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Clock size={10} /> },
  pagato: { label: 'Pagato', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  protestato: { label: 'Protestato', className: 'bg-red-100 text-red-800 border-red-200', icon: <AlertTriangle size={10} /> },
  annullato: { label: 'Annullato', className: 'bg-zinc-100 text-zinc-600 border-zinc-200', icon: <Ban size={10} /> },
}

const tipoIcon: Record<string, React.ReactNode> = {
  assegno: <FileText size={14} className="text-amber-600" />,
  cambiale: <Receipt size={14} className="text-purple-600" />,
}

export function TitoliSection({ titoli }: { titoli: Titolo[] }) {
  if (titoli.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400">
        <Receipt className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nessun titolo registrato</p>
        <p className="text-xs">Clicca &quot;Nuovo Titolo&quot; per aggiungere assegni o cambiali</p>
      </div>
    )
  }

  // KPI aggregati
  const inEssere = titoli.filter(t => t.stato === 'in_essere')
  const totaleInEssere = inEssere.reduce((acc, t) => acc + t.importo, 0)
  const assegni = titoli.filter(t => t.tipo === 'assegno').length
  const cambiali = titoli.filter(t => t.tipo === 'cambiale').length
  const scaduti = inEssere.filter(t => new Date(t.data_scadenza) < new Date()).length

  return (
    <div className="space-y-4">
      {/* KPI Titoli */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
          <p className="text-[10px] font-bold text-amber-600 uppercase">In Essere</p>
          <p className="text-lg font-black text-amber-800">{formatEuro(totaleInEssere)}</p>
          <p className="text-[10px] text-amber-600">{inEssere.length} titoli</p>
        </div>
        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
          <p className="text-[10px] font-bold text-zinc-500 uppercase">Assegni</p>
          <p className="text-2xl font-black text-zinc-800">{assegni}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
          <p className="text-[10px] font-bold text-purple-600 uppercase">Cambiali</p>
          <p className="text-2xl font-black text-purple-800">{cambiali}</p>
        </div>
        {scaduti > 0 && (
          <div className="bg-red-50 rounded-lg p-3 border border-red-100">
            <p className="text-[10px] font-bold text-red-600 uppercase">Scaduti</p>
            <p className="text-2xl font-black text-red-800">{scaduti}</p>
          </div>
        )}
      </div>

      {/* Tabella Titoli */}
      <div className="rounded-md border bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 text-zinc-500 border-b">
            <tr>
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Soggetto</th>
              <th className="p-3 font-medium">N° Titolo</th>
              <th className="p-3 font-medium">Scadenza</th>
              <th className="p-3 font-medium text-right">Importo</th>
              <th className="p-3 font-medium text-center">Stato</th>
              <th className="p-3 font-medium">Banca</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {titoli.map(t => {
              const badge = statoBadge[t.stato]
              const isScaduto = t.stato === 'in_essere' && new Date(t.data_scadenza) < new Date()
              return (
                <tr key={t.id} className={`hover:bg-zinc-50 transition-colors ${isScaduto ? 'bg-red-50/30' : ''}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {tipoIcon[t.tipo]}
                      <span className="text-xs font-medium capitalize">{t.tipo}</span>
                    </div>
                  </td>
                  <td className="p-3 text-zinc-700 truncate max-w-[200px]">
                    {t.anagrafica_soggetti?.ragione_sociale || <span className="text-zinc-400 italic">—</span>}
                  </td>
                  <td className="p-3 font-mono text-xs text-zinc-600">{t.numero_titolo || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 text-xs">
                      <CalendarDays size={12} className={isScaduto ? 'text-red-500' : 'text-zinc-400'} />
                      <span className={isScaduto ? 'text-red-600 font-bold' : ''}>{formatData(t.data_scadenza)}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold">{formatEuro(t.importo)}</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                      {badge.icon} <span className="ml-1">{badge.label}</span>
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-zinc-500">{t.banca_incasso || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
