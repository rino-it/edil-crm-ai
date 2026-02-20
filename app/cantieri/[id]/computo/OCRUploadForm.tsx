'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sparkles, Loader2 } from "lucide-react"

export function OCRUploadForm({ cantiereId }: { cantiereId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleOCR(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    
    try {
      const response = await fetch('/api/preventivo/ocr', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        router.refresh()
      } else {
        alert("Errore durante la digitalizzazione. Riprova.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleOCR} className="flex flex-col gap-4">
      <input type="hidden" name="cantiere_id" value={cantiereId} />
      <Input 
        name="file" 
        type="file" 
        accept="image/*" 
        capture="environment" // Questo apre direttamente la fotocamera su mobile
        required 
        className="bg-white border-purple-200"
      />
      <Button 
        type="submit" 
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 w-full text-white"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Lettura foto in corso...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Digitalizza Computo
          </>
        )}
      </Button>
    </form>
  )
}