'use client'

import { useRef, useState, useTransition } from 'react'
import { Paperclip, Loader2, FileText, X } from 'lucide-react'
import { allegaDocumentoScadenza } from '../actions'
import { toast } from 'sonner'

interface AllegaDocumentoButtonProps {
  scadenzaId: string
  currentUrl: string | null
  compact?: boolean
}

export function AllegaDocumentoButton({ scadenzaId, currentUrl, compact = true }: AllegaDocumentoButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [url, setUrl] = useState(currentUrl)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      try {
        const result = await allegaDocumentoScadenza(scadenzaId, formData)
        if (result.success && result.url) {
          setUrl(result.url)
          toast.success('Documento allegato')
        } else {
          toast.error(result.error || 'Errore upload')
        }
      } catch {
        toast.error('Errore upload documento')
      }
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  if (isPending) {
    return (
      <span className="inline-flex items-center justify-center size-7 rounded-md bg-zinc-100 text-zinc-400">
        <Loader2 size={13} className="animate-spin" />
      </span>
    )
  }

  if (url) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Apri documento allegato"
          className={`inline-flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors ${compact ? 'size-7' : 'h-11 w-12 rounded-xl'}`}
        >
          <FileText size={compact ? 13 : 16} />
        </a>
        <button
          type="button"
          title="Sostituisci documento"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center size-5 rounded bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors"
        >
          <Paperclip size={9} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Allega documento"
        className={`inline-flex items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors ${compact ? 'size-7' : 'h-11 w-12 rounded-xl'}`}
      >
        <Paperclip size={compact ? 13 : 16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  )
}
