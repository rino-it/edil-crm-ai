'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { importaEstrattoConto, handleConferma as confermaAction, handleRifiuta as rifiutaAction, quickCreateSoggetto } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, BrainCircuit, Check, X, Search, Loader2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PaginationControls } from "@/components/ui/pagination-controls"

// STEP 5: Mappa estesa con le categorie speciali
const BADGE_MAP: Record<string, { icon: string; label: string; className: string }> = {
  fattura:           { icon: '📄', label: 'Fattura',         className: 'bg-blue-100 text-blue-800' },
  stipendio:         { icon: '💼', label: 'Stipendio',       className: 'bg-purple-100 text-purple-800' },
  commissione:       { icon: '🏦', label: 'Comm. Banca',     className: 'bg-zinc-100 text-zinc-700' },
  giroconto:         { icon: '🔄', label: 'Giroconto',       className: 'bg-cyan-100 text-cyan-800' },
  carta_credito:     { icon: '💳', label: 'Carta Credito',   className: 'bg-violet-100 text-violet-800' },
  f24:               { icon: '🏛️', label: 'F24/Imposte',     className: 'bg-red-100 text-red-800' },
  finanziamento_socio: { icon: '🤝', label: 'Fin. Socio',      className: 'bg-lime-100 text-lime-800' },
  sepa:              { icon: '⚡', label: 'SEPA/SDD',        className: 'bg-orange-100 text-orange-800' },
  entrata:           { icon: '💰', label: 'Entrata',         className: 'bg-emerald-100 text-emerald-800' },
  utenza:            { icon: '💡', label: 'Utenza',          className: 'bg-teal-100 text-teal-800' },
  // Soggetti Speciali
  leasing:           { icon: '🚗', label: 'Leasing',         className: 'bg-amber-100 text-amber-800' },
  ente_pubblico:     { icon: '🏛️', label: 'Ente/PagoPA',     className: 'bg-red-100 text-red-800' },
  cassa_edile:       { icon: '🏗️', label: 'Cassa Edile',     className: 'bg-yellow-100 text-yellow-800' },
  cessione_quinto:   { icon: '💳', label: 'Cessione Quinto', className: 'bg-pink-100 text-pink-800' },
  assicurazione:     { icon: '🛡️', label: 'Assicurazione',   className: 'bg-indigo-100 text-indigo-800' },
  interessi_bancari: { icon: '📊', label: 'Interessi',       className: 'bg-red-100 text-red-800' },
  mutuo:             { icon: '🏠', label: 'Mutuo',           className: 'bg-stone-100 text-stone-800' },
};

// Template placeholder per nota in base alla categoria
const PLACEHOLDER_MAP: Record<string, string> = {
  fattura: 'Fornitore + n° fattura (es. "Elettrica Sud FT-2025/0142")',
  giroconto: 'Conto destinazione (es. "Da BCC Bari a UniCredit")',
  utenza: 'Tipo utenza + fornitore (es. "Enel Energia - FT 3200145")',
  leasing: 'Rif. contratto (es. "Contratto ALF-2024/5588")',
  carta_credito: 'Ultime cifre carta (es. "Saldo carta *5396")',
  finanziamento_socio: 'Descrizione (es. "Versamento socio Mario Rossi")',
  assicurazione: 'Polizza + tipo (es. "Polizza RCA n.1234 - UNIPOL")',
  commissione: 'Tipo spesa (es. "Canone mensile c/c")',
  f24: 'Tributo + periodo (es. "IRES 2024 - Saldo")',
  interessi_bancari: 'Tipo + periodo (es. "Interessi fido Q4 2024")',
  mutuo: 'Rata + rif. (es. "Rata mutuo n.123456 - Feb 2025")',
};

// Helper per i colori della confidence
const getConfidenceStyle = (conf: number) => {
  if (conf >= 0.95) return 'bg-emerald-100 text-emerald-800';
  if (conf >= 0.70) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
};

interface Props {
  movimenti: any[];
  scadenzeAperte: any[];
  contoId?: string;
  pagination?: any;
}

export default function ClientRiconciliazione({ movimenti, scadenzeAperte, contoId, pagination }: Props) {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  
  const [movimentiLocali, setMovimentiLocali] = useState(movimenti);
  const [manualSelections, setManualSelections] = useState<Record<string, string>>({});
  // filtro testo e categoria override per il match manuale
  const [manualFilters, setManualFilters] = useState<Record<string, string>>({});
  const [manualCategorie, setManualCategorie] = useState<Record<string, string>>({});
  // Stato errori per feedback utente per movimento
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Note manuali per movimento
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  // Quick-create fornitore: { movId, nome, formData originale }
  const [quickCreate, setQuickCreate] = useState<{ movId: string; nome: string; formData: FormData } | null>(null);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);

  // Riga espandibile: una sola alla volta
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // STEP 6: Stato e logica per la barra di ricerca
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setMovimentiLocali(movimenti);
  }, [movimenti]);

  const formatEuro = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUploading(true)
    
    const formData = new FormData(e.currentTarget)
    
    // Assicuriamoci che contoId, anno e mese siano presenti per il nuovo backend (Step 5.3)
    if (contoId && !formData.has('contoId')) formData.append('contoId', contoId);
    if (!formData.has('anno')) formData.append('anno', new Date().getFullYear().toString());
    if (!formData.has('mese')) formData.append('mese', (new Date().getMonth() + 1).toString());

    await importaEstrattoConto(formData)
    setIsUploading(false)
    router.refresh()
  }

  const handleAiAnalysis = async () => {
    const daAnalizzare = movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore")))
    if (daAnalizzare.length === 0) return;

    setIsAnalyzing(true)
    const CHUNK_SIZE = 5; 
    setProgress({ current: 0, total: daAnalizzare.length });

    for (let i = 0; i < daAnalizzare.length; i += CHUNK_SIZE) {
      const chunk = daAnalizzare.slice(i, i + CHUNK_SIZE);
      let success = false;
      let retries = 0;
      
      while (!success && retries < 2) {
        try {
          const response = await fetch('/api/finanza/riconcilia-banca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movimenti: chunk })
          });
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          
          if (data.risultati && Array.isArray(data.risultati)) {
            const receivedIds = new Set(data.risultati.map((r: any) => r.movimento_id));
            setMovimentiLocali((prevMovimenti) => 
              prevMovimenti.map((mov) => {
                const match = data.risultati.find((r: any) => r.movimento_id === mov.id);
                if (match) {
                  return { 
                    ...mov, 
                    ai_suggerimento: match.scadenza_id || null, 
                    soggetto_id: match.soggetto_id || null,
                    ai_confidence: match.confidence || 0, 
                    ai_motivo: match.motivo || "Analisi completata",
                    ragione_sociale: match.ragione_sociale || null,
                    categoria_dedotta: match.categoria || null,
                    personale_id: match.personale_id || null
                  };
                }
                if (chunk.some(c => c.id === mov.id) && !receivedIds.has(mov.id)) {
                  return { ...mov, ai_motivo: "AI non ha fornito risposta", ai_confidence: 0 };
                }
                return mov;
              })
            );
            success = true;
          }
        } catch (error) {
          retries++;
          if (retries >= 2) {
            setMovimentiLocali((prev) => prev.map((mov) => {
              if (chunk.some(c => c.id === mov.id) && !mov.ai_motivo) {
                return { ...mov, ai_motivo: "Errore analisi AI - riprovare", ai_confidence: 0 };
              }
              return mov;
            }));
          } else {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      const processed = Math.min(i + CHUNK_SIZE, daAnalizzare.length);
      setProgress({ current: processed, total: daAnalizzare.length });
      if (processed < daAnalizzare.length) await new Promise(resolve => setTimeout(resolve, 3000));
    }

    setIsAnalyzing(false)
    setProgress({ current: 0, total: 0 })
    router.refresh();
  }

  const handleConferma = async (formData: FormData) => {
    const movId = formData.get('movimento_id') as string;
    let scadenzaId = (formData.get('scadenza_id') as string) || '';
    let soggettoId = (formData.get('soggetto_id') as string) || '';
    const categoria = (formData.get('categoria') as string) || 'fattura';

    const categorieSpeciali = [
      'commissione',
      'giroconto',
      'carta_credito',
      'stipendio',
      'leasing',
      'ente_pubblico',
      'cassa_edile',
      'cessione_quinto',
      'utenza',
      'assicurazione',
      'f24',
      'finanziamento_socio',
      'interessi_bancari',
      'mutuo',
    ];

    const isSpeciale = categorieSpeciali.includes(categoria);

    // FIX: auto-risoluzione soggetto/scadenza dal filtro testo se l'utente non ha selezionato dal dropdown
    if (!isSpeciale && !scadenzaId && !soggettoId) {
      // Prima prova dal form submit (più affidabile), fallback allo state locale
      const filtroDaForm = ((formData.get('manual_filter') as string) || '').toLowerCase().trim();
      const filtro = filtroDaForm || (manualFilters[movId] || '').toLowerCase().trim();

      if (filtro && filtro.length >= 3) {
        const movimento = movimentiLocali.find(m => m.id === movId);
        const isEntrata = (movimento?.importo || 0) > 0;
        const importoMovimento = Math.abs(Number(formData.get('importo')) || 0);

        const matchingScadenze = scadenzeAperte.filter(s => {
          const dirOk = isEntrata ? s.tipo === 'entrata' : s.tipo === 'uscita';
          const nome = (s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale || '').toLowerCase();
          return dirOk && nome.includes(filtro);
        });

        const uniqueSoggetti = Array.from(new Set(
          matchingScadenze
            .map(s => s.soggetto_id)
            .filter(Boolean)
        ));

        if (uniqueSoggetti.length === 1) {
          soggettoId = uniqueSoggetti[0] as string;
          formData.set('soggetto_id', soggettoId);

          const scadenzaMatch = matchingScadenze.find(s => {
            const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
            return Math.abs(residuo - importoMovimento) < 1.0;
          });

          if (scadenzaMatch?.id) {
            scadenzaId = scadenzaMatch.id;
            formData.set('scadenza_id', scadenzaId);
          }
        }

        // Fallback robusto: se i soggetti sono multipli, scegli la scadenza più vicina per importo
        if (!soggettoId && !scadenzaId && matchingScadenze.length > 0) {
          const candidati = matchingScadenze
            .map(s => {
              const residuo = Number(s.importo_totale) - Number(s.importo_pagato || 0);
              return { s, diff: Math.abs(residuo - importoMovimento) };
            })
            .sort((a, b) => a.diff - b.diff);

          const best = candidati[0];
          if (best && best.diff <= 1.0) {
            scadenzaId = best.s.id;
            soggettoId = best.s.soggetto_id || '';
            if (scadenzaId) formData.set('scadenza_id', scadenzaId);
            if (soggettoId) formData.set('soggetto_id', soggettoId);
          }
        }
      }

      // Se non troviamo nelle scadenze aperte, lasciamo che il server cerchi in anagrafica_soggetti
      // Il campo manual_filter è già nel formData dal campo input
    }

    const result = await confermaAction(formData);
    if ((result as any)?.error) {
      // Se il server indica fornitore non trovato, attiva il quick-create
      if ((result as any).error === 'fornitore_non_trovato') {
        setQuickCreate({ movId, nome: (result as any).nome || manualFilters[movId] || '', formData });
        setErrors(prev => ({ ...prev, [movId]: `Fornitore "${(result as any).nome || manualFilters[movId]}" non trovato in anagrafica` }));
      } else {
        setErrors(prev => ({ ...prev, [movId]: (result as any).error }));
      }
      return;
    }
    // Pulisci errore precedente se successo
    setErrors(prev => { const next = { ...prev }; delete next[movId]; return next; });
    setExpandedRow(null);

    setMovimentiLocali(prev => prev.filter(m => m.id !== movId));
  }

  const handleRifiuta = async (formData: FormData) => {
    const movId = formData.get('movimento_id') as string;
    await rifiutaAction(formData);
    setExpandedRow(null);
    setMovimentiLocali(prev => prev.map(m => 
      m.id === movId ? { 
        ...m, 
        ai_suggerimento: null, 
        soggetto_id: null, 
        ai_confidence: null, 
        ai_motivo: null, 
        ragione_sociale: null,
        categoria_dedotta: null,
        personale_id: null
      } : m
    ));
  }

  // STEP 6: Filtro calcolato
  const movimentiFiltrati = movimentiLocali.filter(m => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (m.descrizione || '').toLowerCase().includes(term) ||
      (m.ragione_sociale || '').toLowerCase().includes(term) ||
      (m.ai_motivo || '').toLowerCase().includes(term) ||
      (m.categoria_dedotta || '').toLowerCase().includes(term) ||
      String(m.importo).includes(term) ||
      new Date(m.data_operazione).toLocaleDateString('it-IT').includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">1. Importa Estratto Conto</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="flex gap-3">
              <Input type="file" name="file" accept=".csv,.xml" required className="cursor-pointer" />
              <Button type="submit" disabled={isUploading || !contoId} className="bg-blue-600 hover:bg-blue-700">
                {isUploading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {isUploading ? "Importazione..." : "Importa File"}
              </Button>
            </form>
            {!contoId && <p className="text-xs text-rose-500 mt-2">Nessun conto selezionato.</p>}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">2. Analisi Intelligente</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">
              {movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore"))).length} movimenti pronti per analisi AI.
            </span>
            <Button onClick={handleAiAnalysis} disabled={isAnalyzing || movimentiLocali.filter(m => !m.ai_suggerimento && !m.soggetto_id && (!m.ai_motivo || m.ai_motivo.includes("Errore"))).length === 0} className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto">
              {isAnalyzing ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <BrainCircuit className="h-4 w-4 mr-2" />}
              {isAnalyzing ? `Analisi: ${progress.current} / ${progress.total}` : "Avvia Matching AI"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* STEP 6: Barra di ricerca in mezzo */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input 
            placeholder="Cerca per causale, soggetto, importo, data..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="outline" className="whitespace-nowrap px-3 py-1">
          {movimentiFiltrati.length} / {movimentiLocali.length} righe visibili
        </Badge>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/50">
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Causale</TableHead>
                <TableHead className="text-right w-[120px]">Importo</TableHead>
                <TableHead className="text-right w-[280px]">Stato / Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentiFiltrati.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-zinc-400">
                    Nessun movimento trovato per questa ricerca.
                  </TableCell>
                </TableRow>
              ) : (
                movimentiFiltrati.map((m) => {
                  const suggestedScadenza = scadenzeAperte.find(s => s.id === m.ai_suggerimento);
                  const suggestedSoggetto = scadenzeAperte.find(s => s.soggetto_id === m.soggetto_id);
                  const conf = m.ai_confidence || 0;
                  const isAcconto = m.soggetto_id && !m.ai_suggerimento;
                  const hasSuggerimento = m.ai_suggerimento || isAcconto || (m.categoria_dedotta && m.categoria_dedotta !== 'fattura');
                  const isHighConf = hasSuggerimento && conf >= 0.95;
                  const isExpanded = expandedRow === m.id;
                  const nomeDisplay = m.ragione_sociale || suggestedScadenza?.soggetto?.ragione_sociale || suggestedScadenza?.anagrafica_soggetti?.ragione_sociale || suggestedSoggetto?.ragione_sociale;

                  return (
                    <React.Fragment key={m.id}>
                      {/* === RIGA COMPATTA === */}
                      <TableRow
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/60' : 'hover:bg-zinc-50/50'}`}
                        onClick={() => setExpandedRow(isExpanded ? null : m.id)}
                      >
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(m.data_operazione).toLocaleDateString('it-IT')}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[350px] truncate" title={m.descrizione}>
                          {m.descrizione}
                        </TableCell>
                        <TableCell className={`text-right font-bold whitespace-nowrap ${m.importo > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatEuro(m.importo)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasSuggerimento ? (
                              <>
                                {/* Badge categoria + nome soggetto compatti */}
                                {m.categoria_dedotta && BADGE_MAP[m.categoria_dedotta] && (
                                  <Badge variant="outline" className={`${BADGE_MAP[m.categoria_dedotta].className} border-none py-0 h-5 text-[10px]`}>
                                    {BADGE_MAP[m.categoria_dedotta].icon} {BADGE_MAP[m.categoria_dedotta].label}
                                  </Badge>
                                )}
                                {nomeDisplay && (
                                  <span className="text-xs font-medium text-zinc-700 max-w-[100px] truncate" title={nomeDisplay}>
                                    {nomeDisplay}
                                  </span>
                                )}
                                <Badge variant="outline" className={`${getConfidenceStyle(conf)} border-none py-0 h-5 text-[10px]`}>
                                  {(conf * 100).toFixed(0)}%
                                </Badge>

                                {/* Bottoni inline per alta confidence */}
                                {isHighConf && (
                                  <div className="flex gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                                    <form action={handleConferma}>
                                      <input type="hidden" name="movimento_id" value={m.id} />
                                      {m.ai_suggerimento && <input type="hidden" name="scadenza_id" value={m.ai_suggerimento} />}
                                      {m.soggetto_id && <input type="hidden" name="soggetto_id" value={m.soggetto_id} />}
                                      {m.personale_id && <input type="hidden" name="personale_id" value={m.personale_id} />}
                                      <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                                      <input type="hidden" name="categoria" value={m.categoria_dedotta || 'fattura'} />
                                      <Button size="sm" type="submit" className="bg-emerald-600 hover:bg-emerald-700 h-6 w-6 p-0" title="Conferma">
                                        <Check className="h-3 w-3" />
                                      </Button>
                                    </form>
                                    <form action={handleRifiuta}>
                                      <input type="hidden" name="movimento_id" value={m.id} />
                                      <Button size="sm" type="submit" variant="outline" className="text-rose-600 hover:bg-rose-50 h-6 w-6 p-0" title="Rifiuta">
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </form>
                                  </div>
                                )}

                                {!isHighConf && (
                                  isExpanded
                                    ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                                    : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-zinc-400 italic">
                                  {m.ai_motivo ? 'Da classificare' : 'In attesa di analisi...'}
                                </span>
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                                  : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                                }
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* === PANNELLO ESPANSO === */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-zinc-50/80 p-0 border-l-4 border-blue-400">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                              {/* Colonna sinistra: Dettagli */}
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs text-zinc-500 mb-1 font-medium">Causale completa</p>
                                  <p className="text-sm font-mono bg-white/80 rounded px-2 py-1.5 border border-zinc-100">{m.descrizione}</p>
                                </div>

                                {(m.ai_motivo || hasSuggerimento) && (
                                  <div>
                                    <p className="text-xs text-zinc-500 mb-1 font-medium">Suggerimento AI</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {m.categoria_dedotta && BADGE_MAP[m.categoria_dedotta] && (
                                        <Badge variant="outline" className={`${BADGE_MAP[m.categoria_dedotta].className} border-none py-0 h-5`}>
                                          {BADGE_MAP[m.categoria_dedotta].icon} {BADGE_MAP[m.categoria_dedotta].label}
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className={`${getConfidenceStyle(conf)} border-none py-0 h-5`}>
                                        {(conf * 100).toFixed(0)}%
                                      </Badge>
                                      {nomeDisplay && <span className="text-sm font-semibold">{nomeDisplay}</span>}
                                    </div>
                                    {m.ai_motivo && <p className="text-xs text-zinc-500 mt-1">{m.ai_motivo}</p>}
                                  </div>
                                )}

                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                  <span>Data: {new Date(m.data_operazione).toLocaleDateString('it-IT')}</span>
                                  <span>•</span>
                                  <span className={m.importo > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{formatEuro(m.importo)}</span>
                                </div>
                              </div>

                              {/* Colonna destra: Form */}
                              <div onClick={(e) => e.stopPropagation()}>
                                {hasSuggerimento ? (
                                  <div className="space-y-3">
                                    <p className="text-xs text-zinc-500 font-medium">Conferma o rifiuta il suggerimento</p>
                                    <div className="flex gap-2">
                                      <form action={handleConferma} className="flex-1">
                                        <input type="hidden" name="movimento_id" value={m.id} />
                                        {m.ai_suggerimento && <input type="hidden" name="scadenza_id" value={m.ai_suggerimento} />}
                                        {m.soggetto_id && <input type="hidden" name="soggetto_id" value={m.soggetto_id} />}
                                        {m.personale_id && <input type="hidden" name="personale_id" value={m.personale_id} />}
                                        <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                                        <input type="hidden" name="categoria" value={m.categoria_dedotta || 'fattura'} />
                                        <Button size="sm" type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-9">
                                          <Check className="h-4 w-4 mr-2" /> Conferma
                                        </Button>
                                      </form>
                                      <form action={handleRifiuta}>
                                        <input type="hidden" name="movimento_id" value={m.id} />
                                        <Button size="sm" type="submit" variant="outline" className="text-rose-600 hover:bg-rose-50 h-9 px-4">
                                          <X className="h-4 w-4 mr-1" /> Rifiuta
                                        </Button>
                                      </form>
                                    </div>
                                  </div>
                                ) : (
                                  <form action={handleConferma} className="space-y-2">
                                    <input type="hidden" name="movimento_id" value={m.id} />
                                    <input type="hidden" name="importo" value={Math.abs(m.importo)} />
                                    <input type="hidden" name="soggetto_id" value={manualSelections[m.id] || ''} />

                                    {/* Riga: Cerca fornitore + Categoria */}
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        name="manual_filter"
                                        placeholder="Cerca fornitore..."
                                        className="h-8 text-xs border border-zinc-200 rounded px-2 flex-1 outline-none"
                                        value={manualFilters[m.id] || ''}
                                        onChange={(e) => {
                                          setManualFilters(prev => ({ ...prev, [m.id]: e.target.value }));
                                          setErrors(prev => { const next = { ...prev }; delete next[m.id]; return next; });
                                        }}
                                      />
                                      <select
                                        name="categoria"
                                        className="h-8 text-xs border border-zinc-200 rounded px-1 w-[140px] outline-none"
                                        value={manualCategorie[m.id] || 'fattura'}
                                        onChange={(e) => setManualCategorie(prev => ({ ...prev, [m.id]: e.target.value }))}
                                      >
                                        <option value="fattura">📄 Fattura</option>
                                        <option value="utenza">💡 Utenza</option>
                                        <option value="leasing">🚗 Leasing</option>
                                        <option value="f24">🏦 F24/Imposte</option>
                                        <option value="commissione">🏦 Comm. Banca</option>
                                        <option value="assicurazione">🛡️ Assicurazione</option>
                                        <option value="carta_credito">💳 Carta Credito</option>
                                        <option value="finanziamento_socio">🤝 Fin. Socio</option>
                                        <option value="sepa">⚡ SEPA/SDD</option>
                                        <option value="giroconto">🔄 Giroconto</option>
                                        <option value="interessi_bancari">📊 Interessi Bancari</option>
                                        <option value="mutuo">🏠 Mutuo</option>
                                      </select>
                                    </div>

                                    {/* Riga: Note/Descrizione */}
                                    <input
                                      type="text"
                                      name="note_riconciliazione"
                                      placeholder={PLACEHOLDER_MAP[manualCategorie[m.id] || 'fattura'] || 'Note aggiuntive...'}
                                      className="h-8 text-xs border border-zinc-200 rounded px-2 w-full outline-none"
                                      value={manualNotes[m.id] || ''}
                                      onChange={(e) => setManualNotes(prev => ({ ...prev, [m.id]: e.target.value }))}
                                    />

                                    {/* Riga: Seleziona scadenza + Bottoni */}
                                    <div className="flex gap-2">
                                      <select
                                        name="scadenza_id"
                                        className="h-8 text-xs border border-zinc-200 rounded px-2 flex-1 min-w-0 outline-none"
                                        onChange={(e) => {
                                          const selected = scadenzeAperte.find(s => s.id === e.target.value);
                                          if (selected) {
                                            setManualSelections(prev => ({ ...prev, [m.id]: selected.soggetto_id || '' }));
                                          } else {
                                            setManualSelections(prev => ({ ...prev, [m.id]: '' }));
                                          }
                                        }}
                                      >
                                        <option value="">— Solo categoria (senza scadenza) —</option>
                                        {scadenzeAperte
                                          .filter(s => {
                                            const dirOk = m.importo > 0 ? s.tipo === 'entrata' : s.tipo === 'uscita';
                                            const filtro = (manualFilters[m.id] || '').toLowerCase();
                                            const nome = (s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale || '').toLowerCase();
                                            return dirOk && (!filtro || nome.includes(filtro));
                                          })
                                          .map(s => (
                                            <option key={s.id} value={s.id}>
                                              {s.soggetto?.ragione_sociale || s.anagrafica_soggetti?.ragione_sociale} — {formatEuro(s.importo_totale)}
                                            </option>
                                          ))}
                                      </select>
                                      <Button size="sm" type="submit" className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700">
                                        <Check className="h-4 w-4 mr-1" /> Conferma
                                      </Button>
                                    </div>

                                    {/* Errore + Quick-create */}
                                    {errors[m.id] && (
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-xs text-rose-600 font-medium max-w-[250px] truncate" title={errors[m.id]}>
                                          ⚠ {errors[m.id]}
                                        </p>
                                        {quickCreate?.movId === m.id && (
                                          <Button
                                            size="sm"
                                            type="button"
                                            variant="outline"
                                            className="h-6 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 shrink-0"
                                            onClick={() => setQuickCreate({ movId: m.id, nome: quickCreate?.nome || '', formData: quickCreate?.formData || new FormData() })}
                                          >
                                            <Plus className="h-3 w-3 mr-1" /> Crea Fornitore
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </form>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
          
          {/* NUOVO: Componente di Paginazione */}
          {pagination && (
            <div className="border-t border-zinc-200 bg-zinc-50/50 p-4">
              <PaginationControls 
                totalCount={pagination.totalCount}
                currentPage={pagination.page}
                pageSize={pagination.pageSize}
                totalPages={pagination.totalPages}
              />
            </div>
          )}
          
        </CardContent>
      </Card>
      {/* Modal Quick-Create Fornitore */}
      <Dialog open={!!quickCreate} onOpenChange={(open) => { if (!open) setQuickCreate(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">Crea Nuovo Fornitore</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!quickCreate) return;
              setQuickCreateLoading(true);
              const fd = new FormData(e.currentTarget);
              const result = await quickCreateSoggetto(fd);
              if ((result as any)?.error) {
                setErrors(prev => ({ ...prev, [quickCreate.movId]: (result as any).error }));
                setQuickCreateLoading(false);
                return;
              }
              // Successo: rilancia handleConferma con il nuovo soggetto_id
              const originalFd = quickCreate.formData;
              originalFd.set('soggetto_id', (result as any).soggetto_id);
              setQuickCreate(null);
              setQuickCreateLoading(false);
              const confResult = await confermaAction(originalFd);
              if ((confResult as any)?.error) {
                setErrors(prev => ({ ...prev, [quickCreate!.movId]: (confResult as any).error }));
                return;
              }
              setErrors(prev => { const next = { ...prev }; delete next[quickCreate!.movId]; return next; });
              setMovimentiLocali(prev => prev.filter(m => m.id !== quickCreate!.movId));
            }}
          >
            <div>
              <label className="text-xs font-medium text-zinc-600">Ragione Sociale</label>
              <Input name="ragione_sociale" defaultValue={quickCreate?.nome || ''} required className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Tipo</label>
              <select name="tipo" className="w-full h-9 text-sm border border-zinc-200 rounded px-2 mt-1 outline-none" defaultValue="fornitore">
                <option value="fornitore">Fornitore</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Partita IVA (opzionale)</label>
              <Input name="partita_iva" placeholder="01234567890" className="mt-1" />
            </div>
            <Button type="submit" disabled={quickCreateLoading} className="w-full bg-amber-600 hover:bg-amber-700">
              {quickCreateLoading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Crea e Riconcilia
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}