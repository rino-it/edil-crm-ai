'use client'

import { useState, useEffect } from 'react'
import { Upload, FileText, Loader2, Download, Eye, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { uploadDocumentoBanca, getDocumentiBanca, rinominaDocumentoBanca } from '../actions'

interface DocumentoBanca {
  id: string;
  conto_banca_id: string;
  anno: number;
  nome_file: string;
  url_documento: string;
  created_at: string;
}

export function DocumentiContoDialog({ contoId, nomeBanca }: { contoId: string, nomeBanca: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [documenti, setDocumenti] = useState<DocumentoBanca[]>([])
  const [isUploading, setIsUploading] = useState(false)
  
  // Stati per la rinomina
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)

  useEffect(() => {
    if (isOpen) {
      getDocumentiBanca(contoId, anno).then((data) => setDocumenti(data as DocumentoBanca[]))
    }
  }, [isOpen, anno, contoId])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsUploading(true)
    const formData = new FormData(e.currentTarget)
    formData.append('conto_id', contoId)
    await uploadDocumentoBanca(formData)
    const aggiornati = await getDocumentiBanca(contoId, anno)
    setDocumenti(aggiornati as DocumentoBanca[])
    setIsUploading(false)
    ;(e.target as HTMLFormElement).reset()
  }

  async function handleRenameSubmit(id: string) {
    if (!newName.trim()) {
      setEditingId(null)
      return
    }
    setIsRenaming(true)
    await rinominaDocumentoBanca(id, newName)
    const aggiornati = await getDocumentiBanca(contoId, anno)
    setDocumenti(aggiornati as DocumentoBanca[])
    setEditingId(null)
    setIsRenaming(false)
  }

  function startRename(doc: DocumentoBanca) {
    setEditingId(doc.id)
    // Rimuovi l'estensione per rendere più facile la rinomina all'utente
    setNewName(doc.nome_file.replace(/\.[^/.]+$/, "")) 
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
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
              <div key={doc.id} className="flex items-center justify-between p-2 border rounded bg-zinc-50 group">
                
                {editingId === doc.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={newName} 
                      onChange={(e) => setNewName(e.target.value)} 
                      className="h-8 text-sm" 
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600" onClick={() => handleRenameSubmit(doc.id)} disabled={isRenaming}>
                      {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600" onClick={() => setEditingId(null)} disabled={isRenaming}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 overflow-hidden flex-1 cursor-text" onDoubleClick={() => startRename(doc)}>
                      <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                      <span className="text-sm truncate font-medium" title={doc.nome_file}>{doc.nome_file}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => startRename(doc)} title="Rinomina">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      
                      {/* Tasto Occhio per Anteprima nel Browser */}
                      <a href={doc.url_documento} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Visualizza Anteprima">
                        <Eye className="h-4 w-4" />
                      </a>
                      
                      {/* Tasto Download (Forza scaricamento se supportato o funge da link) */}
                      <a href={`${doc.url_documento}?download=true`} download className="inline-flex items-center justify-center h-8 w-8 rounded text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Scarica File">
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}