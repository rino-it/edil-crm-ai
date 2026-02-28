'use client'

import React, { useState, useMemo } from 'react';

export interface CashflowPoint {
  data: string;
  saldo: number;
  entrate_giorno?: number;
  uscite_giorno?: number;
}

interface CashflowChartProps {
  data: CashflowPoint[];
}

export default function CashflowChart({ data }: CashflowChartProps) {
  const [hovered, setHovered] = useState<CashflowPoint | null>(null);

  // Dimensioni interne dell'SVG (il viewBox lo renderà responsive)
  const width = 800;
  const height = 350;
  const padding = { top: 40, right: 20, bottom: 40, left: 80 };
  const drawWidth = width - padding.left - padding.right;
  const drawHeight = height - padding.top - padding.bottom;

  // Calcolo dei valori minimi e massimi per scalare l'asse Y
  const minSaldo = useMemo(() => {
    const min = Math.min(...data.map(d => d.saldo));
    return min < 0 ? min * 1.1 : min * 0.9; // 10% di margine visivo inferiore
  }, [data]);

  const maxSaldo = useMemo(() => {
    const max = Math.max(...data.map(d => d.saldo));
    return max > 0 ? max * 1.1 : max * 1.1; // 10% di margine visivo superiore
  }, [data]);

  const yRange = maxSaldo - minSaldo || 1; // Previene divisioni per zero

  // Funzioni di conversione Valore -> Coordinate SVG
  const getX = (index: number) => padding.left + (index * (drawWidth / Math.max(data.length - 1, 1)));
  const getY = (value: number) => padding.top + drawHeight - ((value - minSaldo) / yRange) * drawHeight;

  // Generazione dei tracciati vettoriali (Paths)
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.saldo)}`).join(' ');
  const areaPath = `${linePath} L ${getX(data.length - 1)} ${padding.top + drawHeight} L ${padding.left} ${padding.top + drawHeight} Z`;

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-zinc-400 italic border border-dashed border-zinc-200 rounded-lg">
        Nessun dato di cashflow disponibile.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[350px]">
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Gradiente dinamico: Verde sopra 0, Rosso sotto */}
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
            <stop offset={`${Math.max(0, Math.min(100, ((getY(0) - padding.top) / drawHeight) * 100))}%`} stopColor="#22c55e" stopOpacity="0.05" />
            <stop offset={`${Math.max(0, Math.min(100, ((getY(0) - padding.top) / drawHeight) * 100))}%`} stopColor="#ef4444" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Assi Cartesiani */}
        <line x1={padding.left} y1={padding.top + drawHeight} x2={width - padding.right} y2={padding.top + drawHeight} stroke="#e5e7eb" strokeWidth="1" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + drawHeight} stroke="#e5e7eb" strokeWidth="1" />

        {/* Etichette Asse Y (Importi) */}
        <text x={padding.left - 10} y={getY(maxSaldo)} fill="#9ca3af" fontSize="11" textAnchor="end" alignmentBaseline="middle">{formatEuro(maxSaldo)}</text>
        <text x={padding.left - 10} y={getY(minSaldo)} fill="#9ca3af" fontSize="11" textAnchor="end" alignmentBaseline="middle">{formatEuro(minSaldo)}</text>

        {/* Etichette Asse X (Date) - Mostra solo alcune date per evitare sovrapposizioni */}
        {data.map((d, i) => {
          if (i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) {
            return (
              <text key={`x-${i}`} x={getX(i)} y={padding.top + drawHeight + 20} fill="#9ca3af" fontSize="11" textAnchor="middle">
                {formatDate(d.data)}
              </text>
            );
          }
          return null;
        })}

        {/* Rendering dell'Area sotto la curva */}
        <path d={areaPath} fill="url(#areaGradient)" />

        {/* Rendering della Linea del Saldo */}
        <path d={linePath} fill="none" stroke="#0f172a" strokeWidth="2.5" />

        {/* Punti Interattivi (Hover) */}
        {data.map((d, i) => (
          <circle
            key={`pt-${i}`}
            cx={getX(i)}
            cy={getY(d.saldo)}
            r={hovered?.data === d.data ? 7 : 4}
            fill={d.saldo < 0 ? "#ef4444" : "#ffffff"}
            stroke={d.saldo < 0 ? "#ef4444" : "#0f172a"}
            strokeWidth="2"
            className="transition-all duration-200 cursor-pointer origin-center"
            style={{ transformOrigin: `${getX(i)}px ${getY(d.saldo)}px` }}
            onMouseEnter={() => setHovered(d)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>

      {/* Tooltip HTML (Appare solo al passaggio del mouse sui punti) */}
      {hovered && (
        <div 
          className="absolute bg-zinc-900 text-white p-3 rounded-lg shadow-xl text-xs z-10 transform -translate-x-1/2 pointer-events-none transition-opacity animate-in fade-in"
          style={{
            // Posiziona il tooltip in modo responsive sopra il punto
            left: `calc(${(data.findIndex(d => d.data === hovered.data) / Math.max(data.length - 1, 1)) * 100}% * ${(drawWidth) / width} + ${padding.left / width * 100}%)`,
            top: '0px'
          }}
        >
          <div className="font-bold mb-1.5 border-b border-zinc-700 pb-1.5">{new Date(hovered.data).toLocaleDateString('it-IT')}</div>
          <div className="flex justify-between gap-6 mb-1">
            <span className="text-zinc-400">Saldo stimato:</span>
            <span className={`font-bold ${hovered.saldo < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {formatEuro(hovered.saldo)}
            </span>
          </div>
          {(hovered.entrate_giorno !== undefined && hovered.entrate_giorno > 0) && (
            <div className="flex justify-between gap-6 mt-1.5">
              <span className="text-zinc-400">Entrate:</span>
              <span className="text-emerald-400">+{formatEuro(hovered.entrate_giorno)}</span>
            </div>
          )}
          {(hovered.uscite_giorno !== undefined && hovered.uscite_giorno > 0) && (
            <div className="flex justify-between gap-6 mt-1.5">
              <span className="text-zinc-400">Uscite:</span>
              <span className="text-red-400">-{formatEuro(hovered.uscite_giorno)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}