'use client'

import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

export default function ProgrammazioneChart({ data }: { data: any[] }) {
  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
        <XAxis dataKey="weekLabel" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} dy={10} />
        <YAxis yAxisId="left" tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#71717a'}} />
        <Tooltip formatter={(value) => formatEuro(Number(value ?? 0))} labelClassName="font-bold text-zinc-900" />
        <Legend wrapperStyle={{ paddingTop: '20px' }} />
        
        <Bar yAxisId="left" dataKey="entrate" name="Entrate Previste" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar yAxisId="left" dataKey="uscite" name="Uscite Previste" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Line yAxisId="right" type="monotone" dataKey="saldoPrevisto" name="Saldo Cassa" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: 'white' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}