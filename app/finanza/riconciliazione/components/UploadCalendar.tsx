'use client'

import { CheckCircle2, Circle, AlertCircle } from "lucide-react"

interface UploadCalendarProps {
  anno: number;
  uploadsPresenti: number[]; // Array di mesi (1-12) già caricati
}

export function UploadCalendar({ anno, uploadsPresenti }: UploadCalendarProps) {
  const mesi = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", 
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic"
  ];

  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1;
  const annoCorrente = oggi.getFullYear();

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-2 mt-4">
      {mesi.map((nome, index) => {
        const meseNum = index + 1;
        const isCaricato = uploadsPresenti.includes(meseNum);
        
        // Logica temporale
        const isPassato = anno < annoCorrente || (anno === annoCorrente && meseNum < meseCorrente);
        const isCorrente = anno === annoCorrente && meseNum === meseCorrente;

        // Colori di default (Mesi Futuri)
        let statusColor = "bg-zinc-50 border-zinc-200 text-zinc-300";
        let Icon = Circle;
        let tooltipTest = `Mese futuro (${nome} ${anno})`;

        if (isCaricato) {
          // Upload effettuato
          statusColor = "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm";
          Icon = CheckCircle2;
          tooltipTest = `Estratto conto caricato (${nome} ${anno})`;
        } else if (isPassato || isCorrente) {
          // Upload mancante (mese corrente o passato)
          statusColor = "bg-amber-50 border-amber-200 text-amber-600 shadow-sm";
          Icon = AlertCircle;
          tooltipTest = `Estratto conto MANCANTE (${nome} ${anno})`;
        }

        return (
          <div 
            key={nome}
            title={tooltipTest}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-help hover:scale-105 ${statusColor}`}
          >
            <span className="text-[11px] font-black uppercase mb-1.5">{nome}</span>
            <Icon size={20} strokeWidth={2.5} />
          </div>
        );
      })}
    </div>
  );
}