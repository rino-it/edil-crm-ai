"use client";

import { useRouter } from "next/navigation";

export function CantiereFilter({ 
  cantieri, 
  currentId 
}: { 
  cantieri: { id: string; nome: string }[], 
  currentId?: string 
}) {
  const router = useRouter();

  return (
    <select 
      className="h-9 w-full md:w-64 rounded-md border border-zinc-200 bg-white px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
      defaultValue={currentId || ""}
      onChange={(e) => {
        const val = e.target.value;
        router.push(val ? `/scadenze?cantiere_id=${val}` : '/scadenze');
      }}
    >
      <option value="">Tutti i cantieri</option>
      {cantieri.map(c => (
        <option key={c.id} value={c.id}>{c.nome}</option>
      ))}
    </select>
  );
}