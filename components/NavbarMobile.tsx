"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, CalendarCheck, TrendingUp, Menu, X, Users, FileText, Building2, Landmark } from "lucide-react";

export default function NavbarMobile() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const mainLinks = [
    { href: "/cantieri", icon: HardHat, label: "Cantieri" },
    { href: "/scadenze", icon: CalendarCheck, label: "Scadenze" },
    { href: "/finanza", icon: TrendingUp, label: "Finanza" },
  ];

  const otherLinks = [
    { href: "/personale", icon: Users, label: "Personale" },
    { href: "/preventivi", icon: FileText, label: "Preventivi" },
    { href: "/anagrafiche", icon: Building2, label: "Anagrafiche" },
    { href: "/finanza/riconciliazione", icon: Landmark, label: "Riconciliazione" },
  ];

  return (
    <>
      {/* Overlay Menu "Altro" */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] animate-in fade-in duration-200">
          <div className="absolute bottom-20 left-4 right-4 bg-white rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-lg text-zinc-900">Altre Funzioni</span>
              <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-zinc-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {otherLinks.map((link) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  onClick={() => setIsMenuOpen(false)}
                  className="flex flex-col items-center gap-2 p-4 bg-zinc-50 rounded-xl active:scale-95 transition-transform"
                >
                  <link.icon size={24} className="text-blue-600" />
                  <span className="text-xs font-semibold text-zinc-700">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Barra Principale */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-2 py-3 flex justify-around items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        {mainLinks.map(({ href, icon: Icon, label }) => (
          <Link 
            key={href} 
            href={href} 
            className={`flex flex-col items-center gap-1 transition-colors ${pathname.startsWith(href) ? 'text-blue-400' : 'text-gray-400'}`}
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
        
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex flex-col items-center gap-1 transition-colors ${isMenuOpen ? 'text-blue-400' : 'text-gray-400'}`}
        >
          {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          <span className="text-[10px] font-medium">Altro</span>
        </button>
      </nav>
    </>
  );
}