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
  
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  
  const nomeMese = MESI[meseNum - 1]

  // Carica i dati on mount per far apparire i contatori senza dover aprire il modale
  useEffect(() => {
    getEstrattiConto(contoId, anno, meseNum).then((data) => setEstratti(data as EstrattoConto[]))
  }, [anno, meseNum, contoId])

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

  const fileCount = estratti.length;
  const isActive = fileCount > 0 || haEstratto;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          title={`Estratto conto ${nomeMese} ${anno}`}
          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer hover:scale-105 shadow-sm ${estratti.length > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50'}`}
        >
          <span className="text-[11px] font-black uppercase mb-1.5">{nomeMese}</span>
          
          {estratti.length > 0 ? (
             <div className="flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
               <FileText size={10} />
               <span>{estratti.length}</span>
             </div>
          ) : (
             <div className="h-5 w-5 rounded-full border-2 border-dashed border-zinc-300" />
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl shadow-xl">
        <DialogHeader>
          <DialogTitle>Estratti Conto - {nomeMese} {anno}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleUpload} className="space-y-4 pt-4 border-b border-border/50 pb-6">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Carica nuovo estratto</Label>
            <Input type="file" name="file" required accept=".pdf,.csv,.xlsx,.xml" className="hover:border-ring/50 focus-visible:ring-[2px]" />
          </div>
          <Button type="submit" disabled={isUploading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.97] transition-all duration-fast">
            {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Allega File
          </Button>
        </form>

        <div className="space-y-2 max-h-64 overflow-y-auto pt-2 pr-1 custom-scrollbar">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">File Caricati ({fileCount})</h3>
          {fileCount === 0 ? (
             <p className="text-sm text-zinc-500 italic">Nessun estratto conto caricato.</p>
          ) : (
            estratti.map(estratto => (
              <div key={estratto.id} className="flex items-center justify-between p-2.5 border border-border/60 rounded-xl bg-zinc-50/50 hover:bg-white transition-colors group">
                
                {editingId === estratto.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      value={newName} 
                      onChange={(e) => setNewName(e.target.value)} 
                      className="h-8 text-sm focus-visible:ring-[2px]" 
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={() => handleRenameSubmit(estratto.id)} disabled={isRenaming}>
                      {isRenaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50" onClick={() => setEditingId(null)} disabled={isRenaming}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1 cursor-text" onDoubleClick={() => startRename(estratto)}>
                      <div className="p-1.5 bg-emerald-100/50 rounded-lg shrink-0">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-sm truncate font-medium text-zinc-700" title={estratto.nome_file}>{estratto.nome_file}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 active:scale-95" onClick={() => startRename(estratto)} title="Rinomina">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      
                      <a href={estratto.url_documento} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors active:scale-95" title="Anteprima">
                        <Eye className="h-4 w-4" />
                      </a>
                      
                      <a href={`${estratto.url_documento}?download=true`} download className="inline-flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors active:scale-95" title="Scarica">
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