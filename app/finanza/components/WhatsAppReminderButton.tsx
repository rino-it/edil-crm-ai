'use client'

import { Button } from "@/components/ui/button"
import { MessageCircle } from "lucide-react"
import { inviaReminderWhatsApp } from "@/app/scadenze/actions"

export function WhatsAppReminderButton({ scadenzaId }: { scadenzaId: string }) {
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50"
      onClick={() => {
        inviaReminderWhatsApp(scadenzaId);
        alert("Sollecito WhatsApp avviato!");
      }}
      title="Invia Sollecito WhatsApp"
    >
      <MessageCircle size={16} />
    </Button>
  )
}