"use client";

import { useState } from "react";
import { assegnaCantiereAScadenza } from "@/app/scadenze/actions";

interface Cantiere {
  id: string;
  nome: string;
}

export function AssegnaCantiereSelect({
  scadenzaId,
  currentCantiereId,
  cantieri,
}: {
  scadenzaId: string;
  currentCantiereId?: string | null;
  cantieri: Cantiere[];
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setIsUpdating(true);
    const newId = e.target.value;
    await assegnaCantiereAScadenza(scadenzaId, newId);
    setIsUpdating(false);
  };

  return (
    <select
      disabled={isUpdating}
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded w-fit border outline-none transition-all ${
        currentCantiereId
          ? "bg-blue-50 text-blue-600 border-blue-200"
          : "bg-amber-50 text-amber-600 border-amber-200 cursor-pointer hover:bg-amber-100"
      }`}
      defaultValue={currentCantiereId || "null"}
      onChange={handleChange}
    >
      <option value="null">🏢 Spese Generali</option>
      {cantieri.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome.length > 20 ? c.nome.substring(0, 20) + "..." : c.nome}
        </option>
      ))}
    </select>
  );
}