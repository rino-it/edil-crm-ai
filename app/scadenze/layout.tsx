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
    <div className="min-h-screen bg-[var(--background)] p-8 animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Scadenziario</h1>
        <p className="text-muted-foreground">Gestione pagamenti, incassi e flussi di cassa.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-rose-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Da Pagare</CardTitle>
            </div>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-rose-700">{formatEuro(kpis.daPagare)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Da Incassare</CardTitle>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-700">{formatEuro(kpis.daIncassare)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Scaduto</CardTitle>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-700">{formatEuro(kpis.scaduto)}</div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-sm)] border-border/60">
          <CardHeader className="pb-2 border-b border-border/40 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Da Smistare (Cantieri)</CardTitle>
            </div>
            <Inbox className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-700">{kpis.daSmistare}</div>
            <p className="text-xs text-muted-foreground mt-1">Fatture senza cantiere assegnato</p>
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
    </div>
  );
}