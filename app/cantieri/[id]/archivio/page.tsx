import { getDocumentiCantiere } from '@/utils/data-fetcher'
import { uploadDocumento, deleteDocumento } from './actions'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Upload, FileText, Trash2, ExternalLink } from "lucide-react"

export default async function ArchivioCantierePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const documenti = await getDocumentiCantiere(id)

  const getStatusBadge = (stato: string) => {
    switch (stato) {
      case 'Valido': return <Badge className="bg-green-600">Valido 🟢</Badge>
      case 'In_Scadenza': return <Badge className="bg-orange-500">In Scadenza 🟠</Badge>
      case 'Scaduto': return <Badge className="bg-red-600">Scaduto 🔴</Badge>
      default: return <Badge variant="secondary">Sconosciuto</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-2">
              <ArrowLeft size={16} />
              <Link href={`/cantieri/${id}`}>Torna alla Dashboard Cantiere</Link>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-600" /> Archivio Documenti
            </h1>
            <p className="text-zinc-500">Gestisci POS, libretti mezzi, fatture e file del cantiere.</p>
          </div>
        </div>

        {/* Upload Form */}
        <Card className="border-blue-100 bg-blue-50/30 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-blue-800 text-lg">
              <Upload size={18} /> Carica Nuovo Documento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={uploadDocumento} className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <input type="hidden" name="cantiere_id" value={id} />
              <div className="grid w-full max-w-md items-center gap-1.5">
                <Input name="file" type="file" required className="bg-white" />
              </div>
              <div className="grid w-full max-w-xs items-center gap-1.5">
                <select name="categoria" className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <option value="">Auto-rileva (Intelligenza Artificiale)</option>
                  <option value="Sicurezza_POS_PSC">Sicurezza (POS/PSC)</option>
                  <option value="Manutenzione_Mezzi">Manutenzione Mezzi</option>
                  <option value="Personale">Personale</option>
                  <option value="DDT_Fatture">DDT / Fatture</option>
                  <option value="Foto">Foto</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Carica e Analizza</Button>
            </form>
          </CardContent>
        </Card>

        {/* Tabella Documenti */}
        <Card className="shadow-sm border-zinc-200">
          <CardHeader className="bg-white border-b border-zinc-100 pb-4">
            <CardTitle className="text-lg">Documenti Archiviati ({documenti.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {documenti.length === 0 ? (
              <div className="text-center py-16 text-zinc-500 bg-zinc-50/50">
                <p>Nessun documento presente in archivio.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome File</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-center">Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documenti.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium text-zinc-900">{doc.nome_file}</TableCell>
                      <TableCell className="text-zinc-500">{doc.categoria.replace('_', ' ')}</TableCell>
                      <TableCell className="text-zinc-500">
                        {doc.data_scadenza ? new Date(doc.data_scadenza).toLocaleDateString('it-IT') : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(doc.stato_scadenza)}
                      </TableCell>
                      <TableCell className="text-right flex justify-end gap-2">
                        <a href={doc.url_storage} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm"><ExternalLink size={14} /></Button>
                        </a>
                        <form action={async () => {
                          'use server'
                          await deleteDocumento(doc.id, doc.url_storage, doc.cantiere_id)
                        }}>
                          <Button variant="destructive" size="sm" type="submit"><Trash2 size={14} /></Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}