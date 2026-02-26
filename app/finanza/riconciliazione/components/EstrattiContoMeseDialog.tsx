'use client'

import { useState, useEffect } from 'react'
import { Upload, FileText, Loader2, Download, CheckCircle2, Eye, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { uploadEstrattoConto, getEstrattiConto, rinominaEstrattoConto } from '../actions'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

interface EstrattoConto {
  id: string;
  conto_banca_id: string;
  anno: number;
  mese: number;
  nome_file: string;
  url_documento: string;
  created_at: string;
}

interface Props {
  contoId: string;
  anno: number;
  meseNum: number;
  haEstratto: boolean;
}

export function EstrattiContoMeseDialog({ contoId, anno, meseNum, haEstratto }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [estratti, setEstratti] = useState<EstrattoConto[]>([])
  const [isUploading, setIsUploading] = useState(false)
  
  // Stati per la rinomina
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  
  const nomeMese = MESI[meseNum - 1]

  useEffect(() => {
    if (isOpen) {
      getEstrattiConto(contoId, anno, meseNum).then((data) => setEstratti(data as EstrattoConto[]))
    }
  }, [isOpen, anno, meseNum, contoId])

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsUploading(true)
    const formData = new FormData(e.currentTarget)
    formData.append('conto_id', contoId)
    formData.append('anno', anno.toString())
    formData.append('mese', meseNum.toString())
    
    await uploadEstrattoConto(formData)
    const aggiornati = await getEstrattiConto(contoId, anno, meseNum)
    setEstratti(aggiornati as EstrattoConto[])
    setIsUploading(false)
    ;(e.target as HTMLFormElement).reset()
  }

  async function handleRenameSubmit(id: string) {
    if (!newName.trim()) {
      setEditingId(null)
      return
    }
    setIsRenaming(true)
    await rinominaEstrattoConto(id, newName)
    const aggiornati = await getEstrattiConto(contoId, anno, meseNum)
    setEstratti(aggiornati as EstrattoConto[])
    setEditingId(null)
    setIsRenaming(false)
  }

  function startRename(estratto: EstrattoConto) {
    setEditingId(estratto.id)
    setNewName(estratto.nome_file.replace(/\.[^/.]+$/, "")) 
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div 
          title={`Estratto conto ${nomeMese} ${anno}`} 
          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 cursor-pointer hover:shadow-md ${
            haEstratto 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100' 
              : 'bg-white border-border/60 text-muted-foreground hover:bg-muted/20 hover:border-ring/50'
          }`}
        >
          <span className="text-[11px] font-black uppercase mb-1.5">{nomeMese}</span>
          {haEstratto ? (
             <CheckCircle2 className="h-5 w-5" />
          ) : (
             <div className="h-5 w-5 rounded-full border-2 border-dashed border-border" />
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estratti Conto - {nomeMese} {anno}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleUpload} className="space-y-4 pt-4 border-b pb-6">
          <div className="space-y-2">
            <Label>Carica nuovo estratto conto</Label>
            <Input type="file" name="file" required accept=".pdf,.csv,.xlsx" />
          </div>
          <Button type="submit" disabled={isUploading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Allega File
          </Button>
        </form>

        <div className="space-y-2 max-h-64 overflow-y-auto pt-2">
          <h3 className="text-sm font-bold text-zinc-700">File Caricati</h3>
          {estratti.length === 0 ? (
             <p className="text-sm text-zinc-500 italic">Nessun estratto conto caricato.</p>
          ) : (
            estratti.map(estratto => (
              <div key={estratto.id} className="flex items-center justify-between p-2 border rounded bg-zinc-50 group">
                
                {editingId === estratto.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={newName} 
                      onChange={(e) => setNewName(e.target.value)} 
                      className="h-8 text-sm" 
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600" onClick={() => handleRenameSubmit(estratto.id)} disabled={isRenaming}>
                      {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600" onClick={() => setEditingId(null)} disabled={isRenaming}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 overflow-hidden flex-1 cursor-text" onDoubleClick={() => startRename(estratto)}>
                      <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-sm truncate font-medium" title={estratto.nome_file}>{estratto.nome_file}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => startRename(estratto)} title="Rinomina">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      
                      <a href={estratto.url_documento} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Visualizza Anteprima">
                        <Eye className="h-4 w-4" />
                      </a>
                      
                      <a href={`${estratto.url_documento}?download=true`} download className="inline-flex items-center justify-center h-8 w-8 rounded text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Scarica File">
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