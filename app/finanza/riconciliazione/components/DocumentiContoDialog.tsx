'use client'

import { useState, useEffect } from 'react'
import { Upload, FileText, Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { uploadDocumentoBanca, getDocumentiBanca } from '../actions'

export function DocumentiContoDialog({ contoId, nomeBanca }: { contoId: string, nomeBanca: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [documenti, setDocumenti] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      getDocumentiBanca(contoId, anno).then(setDocumenti)
    }
  }, [isOpen, anno, contoId])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsUploading(true)
    const formData = new FormData(e.currentTarget)
    formData.append('conto_id', contoId)
    await uploadDocumentoBanca(formData)
    const aggiornati = await getDocumentiBanca(contoId, anno)
    setDocumenti(aggiornati)
    setIsUploading(false)
    ;(e.target as HTMLFormElement).reset()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {/* IL TUO BOTTONE ORIGINALE */}
        <button data-slot="button" data-variant="ghost" data-size="icon" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all size-9 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50" title="Carica Documenti Importanti">
          <Upload className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Documenti {nomeBanca}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleUpload} className="space-y-4 pt-4 border-b pb-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 w-1/3">
              <Label>Anno</Label>
              <Input type="number" name="anno" value={anno} onChange={(e) => setAnno(parseInt(e.target.value))} required />
            </div>
            <div className="space-y-2 w-2/3">
              <Label>Seleziona File</Label>
              <Input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg" />
            </div>
          </div>
          <Button type="submit" disabled={isUploading} className="w-full bg-zinc-900 text-white">
            {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Carica Documento
          </Button>
        </form>

        <div className="space-y-2 max-h-64 overflow-y-auto pt-2">
          <h3 className="text-sm font-bold text-zinc-700">Archivio {anno}</h3>
          {documenti.length === 0 ? (
             <p className="text-sm text-zinc-500 italic">Nessun documento trovato per questo anno.</p>
          ) : (
            documenti.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-2 border rounded bg-zinc-50">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-sm truncate" title={doc.nome_file}>{doc.nome_file}</span>
                </div>
                <a href={doc.url_documento} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-zinc-200 rounded text-zinc-600">
                  <Download className="h-4 w-4" />
                </a>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}