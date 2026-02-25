'use client'

import { Button } from "@/components/ui/button"
import { CalendarPlus } from "lucide-react"

export function CalendarLinkButton({ scadenzaId }: { scadenzaId: string }) {
  return (
    <a href={`/api/calendar?scadenzaId=${scadenzaId}`} target="_blank" rel="noopener noreferrer">
      <Button 
        variant="ghost" 
        size="icon" 
        className="text-zinc-400 hover:text-blue-600 hover:bg-blue-50"
        title="Aggiungi a Calendario"
      >
        <CalendarPlus size={16} />
      </Button>
    </a>
  )
}