'use client'

import React, { useEffect, useState } from 'react'

export interface AgingData {
  label: string;
  importo: number;
  count: number;
  color?: string;
}

export default function AgingChart({ data }: { data: AgingData[] }) {
  // Ritardo per l'animazione di riempimento all'avvio
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Calcolo dei massimali per la proporzione delle barre SVG
  const maxImporto = Math.max(...data.map(d => d.importo), 1); // Evita divisione per zero
  const totalImporto = data.reduce((acc, curr) => acc + curr.importo, 0);

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  // Mappatura colori rigorosa come da specifiche (Step 4.3)
  const defaultColors: Record<string, string> = {
    "0-30 gg": "#22c55e",   // Verde
    "31-60 gg": "#eab308",  // Giallo
    "61-90 gg": "#f97316",  // Arancione
    "> 90 gg": "#ef4444"    // Rosso
  };

  if (totalImporto === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-zinc-400 italic border border-dashed border-zinc-200 rounded-lg">
        Nessun credito scaduto. Ottimo lavoro!
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {data.map((item, index) => {
        // La larghezza della barra è calcolata rispetto al valore massimo per sfruttare tutto lo spazio
        const widthPercentage = mounted ? Math.round((item.importo / maxImporto) * 100) : 0;
        // Il peso percentuale sul totale dei crediti
        const relativeToTotal = Math.round((item.importo / totalImporto) * 100);
        
        const barColor = defaultColors[item.label] || item.color || "#9ca3af";

        return (
          <div key={index} className="flex flex-col gap-1.5 group">
            <div className="flex justify-between items-end text-xs font-semibold text-zinc-700">
              <span className="flex items-center gap-2">
                <span 
                  className="w-2.5 h-2.5 rounded-full block" 
                  style={{ backgroundColor: barColor }} 
                />
                {item.label}
                <span className="text-[10px] text-zinc-400 font-normal">
                  ({item.count} fatture)
                </span>
              </span>
              <span className="text-right">
                {formatEuro(item.importo)}
                <span className="text-[10px] text-zinc-400 font-normal ml-1">
                  ({relativeToTotal}%)
                </span>
              </span>
            </div>
            
            {/* Barra Orizzontale in SVG Puro */}
            <svg 
              className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden" 
              preserveAspectRatio="none"
            >
              <rect
                x="0"
                y="0"
                height="100%"
                width={`${widthPercentage}%`}
                fill={barColor}
                rx="6"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
          </div>
        );
      })}
    </div>
  )
}