'use client'

import { useState, useEffect } from 'react'
import { Upload, FileText, Loader2, Download, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label' // <-- IMPORT AGGIUNTO
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { uploadEstrattoConto, getEstrattiConto } from '../actions'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

// <-- INTERFACCIA TYPESCRIPT AGGIUNTA PER ELIMINARE "any"
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
  meseNum: number; // 1-12
  haEstratto: boolean; // Se ha già file caricati
}

export function EstrattiContoMeseDialog({ contoId, anno, meseNum, haEstratto }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [estratti, setEstratti] = useState<EstrattoConto[]>([]) // <-- TIPO DEFINITO, ADDIO "any"
  const [isUploading, setIsUploading] = useState(false)
  
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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div title={`Estratto conto ${nomeMese} ${anno}`} className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer hover:scale-105 shadow-sm ${haEstratto ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50'}`}>
          <span className="text-[11px] font-black uppercase mb-1.5">{nomeMese}</span>
          {haEstratto ? (
             <CheckCircle2 className="h-5 w-5" />
          ) : (
             <div className="h-5 w-5 rounded-full border-2 border-dashed border-zinc-300" />
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
              <div key={estratto.id} className="flex items-center justify-between p-2 border rounded bg-zinc-50">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-sm truncate">{estratto.nome_file}</span>
                </div>
                <a href={estratto.url_documento} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-zinc-200 rounded text-zinc-600">
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