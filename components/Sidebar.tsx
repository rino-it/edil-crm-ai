'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HardHat, 
  Users, 
  Contact2, 
  CalendarClock, 
  TrendingUp, 
  Landmark, 
  ChevronDown, 
  ChevronRight,
  CircleArrowOutUpRight,
  CircleArrowOutDownLeft,
  AlertTriangle,
  Archive,
  SplitSquareVertical,
  LayoutDashboard,
  LineChart,
  FileDown
} from 'lucide-react'

// Funzione helper per simulare/recuperare il count "Da Smistare" (puoi implementarla con SWR/fetch reale in futuro)
function useSmistareCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    // Piccolo fetch in background per non bloccare la UI
    fetch('/api/cron/scadenze/count-da-smistare')
      .then(res => res.json())
      .then(data => setCount(data.count))
      .catch(() => setCount(null));
  }, []);
  return count;
}

export function Sidebar() {
  const pathname = usePathname()
  
  // Stati per i menu espandibili
  const [isScadenzeOpen, setIsScadenzeOpen] = useState(pathname.includes('/scadenze'))
  const [isFinanzaOpen, setIsFinanzaOpen] = useState(pathname.includes('/finanza') && !pathname.includes('/finanza/riconciliazione'))

  // Count asincrono per il badge
  const smistareCount = useSmistareCount()

  // Helper per evidenziare la rotta attiva
  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

  return (
    <div className="w-64 bg-zinc-900 text-zinc-300 min-h-screen flex flex-col shadow-xl">
      <div className="p-6 border-b border-zinc-800">
        <h1 className="text-2xl font-black text-white tracking-tight">Edil<span className="text-blue-500">CRM</span></h1>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        
        {/* Voci Singole Base */}
        <Link href="/cantieri" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/cantieri') ? 'bg-blue-600/10 text-blue-400 font-medium' : 'hover:bg-zinc-800 hover:text-white'}`}>
          <HardHat size={20} /> Cantieri
        </Link>
        
        <Link href="/personale" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/personale') ? 'bg-blue-600/10 text-blue-400 font-medium' : 'hover:bg-zinc-800 hover:text-white'}`}>
          <Users size={20} /> Personale
        </Link>
        
        <Link href="/anagrafiche" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/anagrafiche') ? 'bg-blue-600/10 text-blue-400 font-medium' : 'hover:bg-zinc-800 hover:text-white'}`}>
          <Contact2 size={20} /> Anagrafiche
        </Link>

        <div className="my-4 border-t border-zinc-800/50"></div>

        {/* ========================================== */}
        {/* MENU ESPANDIBILE: SCADENZE               */}
        {/* ========================================== */}
        <div>
          <button 
            onClick={() => setIsScadenzeOpen(!isScadenzeOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${pathname.includes('/scadenze') ? 'text-white font-medium' : 'hover:bg-zinc-800 hover:text-white'}`}
          >
            <div className="flex items-center gap-3">
              <CalendarClock size={20} className={pathname.includes('/scadenze') ? 'text-emerald-500' : ''} />
              Scadenziario
            </div>
            {isScadenzeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {isScadenzeOpen && (
            <div className="ml-9 mt-1 space-y-1 border-l border-zinc-800 pl-2">
              <Link href="/scadenze/da-pagare" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/scadenze/da-pagare' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <CircleArrowOutUpRight size={14} className="text-orange-500" /> Da Pagare
              </Link>
              <Link href="/scadenze/da-incassare" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/scadenze/da-incassare' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <CircleArrowOutDownLeft size={14} className="text-emerald-500" /> Da Incassare
              </Link>
              <Link href="/scadenze/scadute" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/scadenze/scadute' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <AlertTriangle size={14} className="text-rose-500" /> Scadute
              </Link>
              <Link href="/scadenze/da-smistare" className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/scadenze/da-smistare' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <div className="flex items-center gap-2">
                  <SplitSquareVertical size={14} className="text-blue-400" /> Da Smistare
                </div>
                {smistareCount !== null && smistareCount > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{smistareCount}</span>
                )}
              </Link>
              <Link href="/scadenze/pagate" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/scadenze/pagate' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <Archive size={14} className="text-zinc-500" /> Archivio Pagate
              </Link>
            </div>
          )}
        </div>

        {/* ========================================== */}
        {/* MENU ESPANDIBILE: FINANZA                */}
        {/* ========================================== */}
        <div>
          <button 
            onClick={() => setIsFinanzaOpen(!isFinanzaOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${(pathname.includes('/finanza') && !pathname.includes('/riconciliazione')) ? 'text-white font-medium' : 'hover:bg-zinc-800 hover:text-white'}`}
          >
            <div className="flex items-center gap-3">
              <TrendingUp size={20} className={(pathname.includes('/finanza') && !pathname.includes('/riconciliazione')) ? 'text-blue-500' : ''} />
              Finanza
            </div>
            {isFinanzaOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {isFinanzaOpen && (
            <div className="ml-9 mt-1 space-y-1 border-l border-zinc-800 pl-2">
              <Link href="/finanza" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/finanza' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <LayoutDashboard size={14} className="text-zinc-400" /> Dashboard
              </Link>
              <Link href="/finanza/programmazione" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/finanza/programmazione' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <LineChart size={14} className="text-indigo-400" /> Programmazione
              </Link>
              <Link href="/finanza/importa-fatture" className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${pathname === '/finanza/importa-fatture' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
                <FileDown size={14} className="text-emerald-400" /> Importa Fatture
              </Link>
            </div>
          )}
        </div>

        {/* Voce Riconciliazione (Separata per importanza) */}
        <Link href="/finanza/riconciliazione" className={`flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg transition-colors ${pathname.includes('/finanza/riconciliazione') ? 'bg-indigo-600/10 text-indigo-400 font-medium border border-indigo-500/20' : 'hover:bg-zinc-800 hover:text-white'}`}>
          <Landmark size={20} /> Riconciliazione
        </Link>

      </nav>

      {/* Footer Utente */}
      <div className="p-4 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between items-center">
        <span>EdilCRM v3.0</span>
        <span className="h-2 w-2 bg-emerald-500 rounded-full" title="Sistema Operativo"></span>
      </div>
    </div>
  )
}