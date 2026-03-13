'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, FileText, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { importaPdfFatture, type ImportPdfResult } from '../actions'

type Phase = 'idle' | 'uploading' | 'done'

export default function ImportaPdfModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [files, setFiles] = useState<File[]>([])
  const [risultati, setRisultati] = useState<ImportPdfResult[]>([])
  const [totali, setTotali] = useState({ associati: 0, duplicati: 0, nonTrovati: 0, errori: 0, noPattern: 0 })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setFiles([])
    setRisultati([])
    setTotali({ associati: 0, duplicati: 0, nonTrovati: 0, errori: 0, noPattern: 0 })
    setDragOver(false)
  }, [])

  const handleFiles = (newFiles: FileList | File[]) => {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length > 0) setFiles(prev => [...prev, ...pdfs])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (files.length === 0) return
    setPhase('uploading')

    const formData = new FormData()
    for (const f of files) formData.append('files', f)

    try {
      const res = await importaPdfFatture(formData)
      setRisultati(res.risultati)
      setTotali(res.totali)
      setPhase('done')
      router.refresh()
    } catch (err) {
      setRisultati([{ filename: 'Errore generale', status: 'errore', error: String(err) }])
      setTotali({ associati: 0, duplicati: 0, nonTrovati: 0, errori: files.length, noPattern: 0 })
      setPhase('done')
    }
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const statusIcon = (status: ImportPdfResult['status']) => {
    switch (status) {
      case 'associato': return <CheckCircle2 size={16} className="text-green-600 shrink-0" />
      case 'duplicato': return <MinusCircle size={16} className="text-zinc-400 shrink-0" />
      case 'non_trovato': return <AlertTriangle size={16} className="text-amber-500 shrink-0" />
      case 'errore': return <XCircle size={16} className="text-red-500 shrink-0" />
      case 'no_pattern': return <XCircle size={16} className="text-red-400 shrink-0" />
    }
  }

  const statusLabel = (status: ImportPdfResult['status']) => {
    switch (status) {
      case 'associato': return 'Associato'
      case 'duplicato': return 'Doppione (scartato)'
      case 'non_trovato': return 'Nessuna scadenza trovata'
      case 'errore': return 'Errore'
      case 'no_pattern': return 'Nome file non riconosciuto'
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 text-xs md:text-sm">
          <Upload size={16} />
          <span className="hidden sm:inline">Importa PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importa PDF Fatture</DialogTitle>
        </DialogHeader>

        {phase === 'idle' && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'
              }`}
            >
              <Upload size={32} className="mx-auto mb-3 text-zinc-400" />
              <p className="text-sm text-zinc-600">Trascina i PDF delle fatture qui</p>
              <p className="text-xs text-zinc-400 mt-1">oppure clicca per selezionare</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            {files.length > 0 && (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm px-2 py-1 bg-zinc-50 rounded">
                      <FileText size={14} className="text-zinc-400 shrink-0" />
                      <span className="truncate flex-1">{f.name}</span>
                      <button onClick={() => removeFile(i)} className="text-zinc-400 hover:text-red-500 text-xs shrink-0">x</button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleSubmit} className="w-full">
                  Importa {files.length} PDF
                </Button>
              </>
            )}
          </div>
        )}

        {phase === 'uploading' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 size={32} className="animate-spin text-blue-600" />
            <p className="text-sm text-zinc-600">Elaborazione di {files.length} file in corso...</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {totali.associati > 0 && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded px-3 py-2">
                  <CheckCircle2 size={16} /> {totali.associati} associati
                </div>
              )}
              {totali.duplicati > 0 && (
                <div className="flex items-center gap-2 text-zinc-500 bg-zinc-100 rounded px-3 py-2">
                  <MinusCircle size={16} /> {totali.duplicati} doppioni
                </div>
              )}
              {totali.nonTrovati > 0 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded px-3 py-2">
                  <AlertTriangle size={16} /> {totali.nonTrovati} non trovati
                </div>
              )}
              {(totali.errori + totali.noPattern) > 0 && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded px-3 py-2">
                  <XCircle size={16} /> {totali.errori + totali.noPattern} errori
                </div>
              )}
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1">
              {risultati.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs px-2 py-1.5 rounded bg-zinc-50">
                  {statusIcon(r.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.filename}</p>
                    <p className="text-zinc-500">
                      {statusLabel(r.status)}
                      {r.fatturaRif && ` - Fatt. ${r.fatturaRif}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={reset} className="w-full">
              Importa altri PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
