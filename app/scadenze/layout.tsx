import { getScadenzeKPIs } from '@/utils/data-fetcher';
import ScadenzeNav from './components/ScadenzeNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, Inbox } from 'lucide-react';

export default async function ScadenzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kpis = await getScadenzeKPIs();
  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Scadenziario</h1>
        <p className="text-zinc-500">Gestione pagamenti, incassi e flussi di cassa.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-rose-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-rose-800">Da Pagare</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-900">{formatEuro(kpis.daPagare)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-emerald-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">Da Incassare</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-900">{formatEuro(kpis.daIncassare)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-amber-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">Scaduto</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{formatEuro(kpis.scaduto)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-zinc-900 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-300">Da Smistare (Cantieri)</CardTitle>
            <Inbox className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.daSmistare}</div>
            <p className="text-xs text-zinc-400 mt-1">Fatture senza cantiere assegnato</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigazione Tab */}
      <ScadenzeNav badgeDaSmistare={kpis.daSmistare} />

      {/* Contenuto dinamico delle sotto-pagine */}
      <div className="min-h-[500px]">
        {children}
      </div>
    </div>
  );
}