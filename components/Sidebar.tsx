'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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
    <div className="w-64 bg-[#0f1117] text-zinc-300 min-h-screen flex flex-col shadow-xl">
      {/* Logo Area con sottile ombra */}
      <div className="p-6 border-b border-white/5 shadow-md">
        <h1 className="text-2xl font-black text-white tracking-tight">Edil<span className="text-blue-500">CRM</span></h1>
      </div>

      {/* Scrollbar personalizzato */}
      <style>{`
        .sidebar-nav::-webkit-scrollbar {
          width: 6px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto sidebar-nav">
        
        {/* Voci Singole Base */}
        <SidebarLink href="/cantieri" isActive={isActive('/cantieri')} icon={<HardHat size={20} />}>
          Cantieri
        </SidebarLink>
        
        <SidebarLink href="/personale" isActive={isActive('/personale')} icon={<Users size={20} />}>
          Personale
        </SidebarLink>
        
        <SidebarLink href="/anagrafiche" isActive={isActive('/anagrafiche')} icon={<Contact2 size={20} />}>
          Anagrafiche
        </SidebarLink>

        <div className="my-4 border-t border-white/5"></div>

        {/* ========================================== */}
        {/* MENU ESPANDIBILE: SCADENZE               */}
        {/* ========================================== */}
        <ExpandableMenu 
          label="Scadenziario"
          icon={<CalendarClock size={20} />}
          isOpen={isScadenzeOpen}
          setIsOpen={setIsScadenzeOpen}
          isActive={pathname.includes('/scadenze')}
        >
          <SubMenuLink href="/scadenze/da-pagare" isActive={pathname === '/scadenze/da-pagare'} icon={<CircleArrowOutUpRight size={14} className="text-orange-500" />}>
            Da Pagare
          </SubMenuLink>
          <SubMenuLink href="/scadenze/da-incassare" isActive={pathname === '/scadenze/da-incassare'} icon={<CircleArrowOutDownLeft size={14} className="text-emerald-500" />}>
            Da Incassare
          </SubMenuLink>
          <SubMenuLink href="/scadenze/scadute" isActive={pathname === '/scadenze/scadute'} icon={<AlertTriangle size={14} className="text-rose-500" />}>
            Scadute
          </SubMenuLink>
          <SubMenuLink href="/scadenze/da-smistare" isActive={pathname === '/scadenze/da-smistare'} icon={<SplitSquareVertical size={14} className="text-blue-400" />} badge={smistareCount}>
            Da Smistare
          </SubMenuLink>
          <SubMenuLink href="/scadenze/pagate" isActive={pathname === '/scadenze/pagate'} icon={<Archive size={14} className="text-zinc-500" />}>
            Archivio Pagate
          </SubMenuLink>
        </ExpandableMenu>

        {/* ========================================== */}
        {/* MENU ESPANDIBILE: FINANZA                */}
        {/* ========================================== */}
        <ExpandableMenu 
          label="Finanza"
          icon={<TrendingUp size={20} />}
          isOpen={isFinanzaOpen}
          setIsOpen={setIsFinanzaOpen}
          isActive={pathname.includes('/finanza') && !pathname.includes('/riconciliazione')}
        >
          <SubMenuLink href="/finanza" isActive={pathname === '/finanza'} icon={<LayoutDashboard size={14} className="text-zinc-400" />}>
            Dashboard
          </SubMenuLink>
          <SubMenuLink href="/finanza/programmazione" isActive={pathname === '/finanza/programmazione'} icon={<LineChart size={14} className="text-indigo-400" />}>
            Programmazione
          </SubMenuLink>
          <SubMenuLink href="/finanza/importa-fatture" isActive={pathname === '/finanza/importa-fatture'} icon={<FileDown size={14} className="text-emerald-400" />}>
            Importa Fatture
          </SubMenuLink>
        </ExpandableMenu>

        {/* Voce Riconciliazione (Separata per importanza) */}
        <SidebarLink href="/finanza/riconciliazione" isActive={pathname.includes('/finanza/riconciliazione')} icon={<Landmark size={20} />} variant="special">
          Riconciliazione
        </SidebarLink>

      </nav>

      {/* Footer Utente */}
      <div className="p-4 border-t border-white/5 text-xs text-zinc-500 flex justify-between items-center">
        <span>EdilCRM v3.0</span>
        <span className="h-2 w-2 bg-emerald-500 rounded-full" title="Sistema Operativo"></span>
      </div>
    </div>
  )
}

// Componente SidebarLink riutilizzabile
function SidebarLink({ href, isActive, icon, children, variant = 'default' }: 
  { href: string; isActive: boolean; icon: React.ReactNode; children: React.ReactNode; variant?: 'default' | 'special' }) {
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative ${
        isActive 
          ? variant === 'special'
            ? 'bg-indigo-600/10 text-indigo-400 font-medium border-l-3 border-indigo-500 bg-white/5 text-white'
            : 'bg-white/5 text-white font-medium border-l-3 border-blue-500'
          : 'hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {icon} {children}
    </Link>
  )
}

// Componente SubMenuLink
function SubMenuLink({ href, isActive, icon, children, badge }: 
  { href: string; isActive: boolean; icon: React.ReactNode; children: React.ReactNode; badge?: number | null }) {
  return (
    <Link 
      href={href} 
      className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
        isActive 
          ? 'bg-white/10 text-white font-medium'
          : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon} {children}
      </div>
      {badge !== null && badge && badge > 0 && (
        <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </Link>
  )
}

// Componente ExpandableMenu con animazione Framer Motion
function ExpandableMenu({ label, icon, isOpen, setIsOpen, isActive, children }:
  { label: string; icon: React.ReactNode; isOpen: boolean; setIsOpen: (value: boolean) => void; isActive: boolean; children: React.ReactNode }) {
  return (
    <div>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
          isActive ? 'text-white font-medium' : 'hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          {icon}
          {label}
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
        >
          <ChevronDown size={16} />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
            className="ml-9 mt-1 space-y-1 border-l border-white/10 pl-2 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}