'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Loader2, Server } from "lucide-react"

interface FilePreview {
  file: File;
  numero: string;
  soggetto: string;
  importo: number;
  status: 'pending' | 'success' | 'error' | 'skipped';
  errorMsg?: string;
}

export default function ImportaFatturePage() {
  const [activeTab, setActiveTab] = useState<'vendita' | 'acquisto'>('vendita');
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  // Estrazione rapida client-side tramite Regex per la Preview
  const generatePreview = async (file: File): Promise<FilePreview> => {
    const text = await file.text();
    
    // Funzioni helper per cercare i tag ignorando i namespace (es. <p:Numero> o <Numero>)
    const extractTag = (xml: string, tag: string) => {
      const match = xml.match(new RegExp(`<\\w*?:?${tag}[^>]*>(.*?)</\\w*?:?${tag}>`, 'i'));
      return match ? match[1] : '-';
    };

    const denominazione = extractTag(text, 'Denominazione');
    const nome = extractTag(text, 'Nome');
    const cognome = extractTag(text, 'Cognome');
    const soggetto = denominazione !== '-' ? denominazione : (nome !== '-' ? `${nome} ${cognome}` : 'Sconosciuto');

    return {
      file,
      numero: extractTag(text, 'Numero'),
      soggetto: soggetto,
      importo: parseFloat(extractTag(text, 'ImportoTotaleDocumento') || '0'),
      status: 'pending'
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    
    const newFiles = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.xml'));
    const previewPromises = newFiles.map(f => generatePreview(f));
    const generatedPreviews = await Promise.all(previewPromises);
    
    setPreviews(prev => [...prev, ...generatedPreviews]);
    setUploadResult(null); // Resetta eventuali risultati precedenti
    
    // Resetta l'input file per permettere di ricaricare lo stesso file se necessario
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (previews.length === 0) return;
    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    previews.forEach(p => formData.append('files', p.file));

    try {
      // API call alla rotta creata nello Step 4.2
      // Nota: per ora supportiamo solo 'vendita' tramite UI. 
      const endpoint = activeTab === 'vendita' 
        ? '/api/import/fatture-vendita' 
        : '/api/import/fatture-acquisto'; // Predisposto per il futuro

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const resultData = await res.json();

      if (!res.ok) throw new Error(resultData.error || "Errore durante l'importazione");

      setUploadResult({
        success: resultData.success || 0,
        skipped: resultData.skipped || 0,
        errors: resultData.errors || []
      });

      // Aggiorniamo visualmente le righe che hanno avuto successo
      setPreviews(prev => prev.map(p => ({ ...p, status: 'success' })));

    } catch (error: any) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
          <UploadCloud className="h-8 w-8 text-blue-600" /> Importazione XML
        </h1>
        <p className="text-zinc-500 mt-1">Carica e analizza le fatture elettroniche per alimentare lo scadenziario.</p>
      </div>

      {/* TABS */}
      <div className="flex space-x-1 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('vendita')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'vendita' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'}`}
        >
          Fatture di Vendita (Clienti)
        </button>
        <button
          onClick={() => setActiveTab('acquisto')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'acquisto' ? 'border-orange-600 text-orange-700 bg-orange-50/50' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'}`}
        >
          Fatture di Acquisto (Fornitori)
        </button>
      </div>

      {/* AVVISO ACQUISTI (NAS) */}
      {activeTab === 'acquisto' && (
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3 text-orange-800">
          <Server className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold">Automazione Attiva sul NAS</p>
            <p className="text-sm mt-1">
              L'importazione massiva delle fatture di acquisto è gestita automaticamente dallo script Python 
              (<code className="bg-orange-100 px-1 rounded">scarica_fatture.py</code>) in esecuzione sul server locale. 
              Usa questa funzione manuale solo per caricare file eccezionali o arretrati non intercettati.
            </p>
          </div>
        </div>
      )}

      {/* DRAG & DROP ZONE */}
      <Card className="border-2 border-dashed border-zinc-300 bg-zinc-50/50 hover:bg-zinc-50 transition-colors">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="p-4 bg-white rounded-full shadow-sm mb-4">
            <FileText className="h-8 w-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1">Trascina qui i tuoi file XML</h3>
          <p className="text-sm text-zinc-500 mb-6 text-center max-w-md">
            Puoi selezionare più fatture contemporaneamente. Il sistema estrarrà i dati, creerà le anagrafiche mancanti e genererà le scadenze.
          </p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            multiple 
            accept=".xml" 
            className="hidden" 
          />
          <Button onClick={() => fileInputRef.current?.click()} className="bg-zinc-900 text-white">
            Sfoglia File...
          </Button>
        </CardContent>
      </Card>

      {/* RESULT ZONE */}
      {uploadResult && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${uploadResult.errors.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Elaborazione Completata</p>
            <ul className="mt-2 text-sm space-y-1">
              <li>✅ <strong>{uploadResult.success}</strong> fatture importate con successo.</li>
              {uploadResult.skipped > 0 && <li>⚠️ <strong>{uploadResult.skipped}</strong> fatture ignorate (già presenti a sistema).</li>}
            </ul>
            {uploadResult.errors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200/50 text-xs">
                <p className="font-bold mb-1 text-red-700">Errori rilevati:</p>
                <ul className="list-disc pl-4 space-y-1 text-red-600">
                  {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PREVIEW TABLE */}
      {previews.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-lg">Anteprima File Selezionati ({previews.length})</CardTitle>
              <CardDescription>Verifica i dati prima di confermare l'importazione.</CardDescription>
            </div>
            {previews.some(p => p.status === 'pending') && (
              <Button 
                onClick={handleUpload} 
                disabled={isUploading || activeTab === 'acquisto'} // Previeni invio acquisti temporaneamente
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Elaborazione...</> : 'Conferma Importazione'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-zinc-50">
                <TableRow>
                  <TableHead>File XML</TableHead>
                  <TableHead>N. Fattura</TableHead>
                  <TableHead>Soggetto</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Automazioni</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previews.map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-mono text-zinc-500 max-w-[150px] truncate" title={p.file.name}>
                      {p.file.name}
                    </TableCell>
                    <TableCell className="font-bold">{p.numero}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">{p.soggetto}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{formatEuro(p.importo)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 w-fit">
                          Auto-Cantiere (DDT)
                        </Badge>
                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200 w-fit">
                          Auto-Anagrafica
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.status === 'pending' ? (
                        <Button variant="ghost" size="icon" onClick={() => removeFile(idx)} className="text-zinc-400 hover:text-red-600" disabled={isUploading}>
                          <X size={16} />
                        </Button>
                      ) : (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

    </div>
  )
}