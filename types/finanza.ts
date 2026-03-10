import { Soggetto } from "@/utils/data-fetcher"; // Importa la tua interfaccia esistente

export interface ScadenzaPagamento {
  id: string;
  fattura_riferimento?: string;
  importo_totale: number;
  importo_pagato: number;
  data_scadenza: string;
  data_pianificata?: string;
  data_emissione?: string;
  data_pagamento?: string;
  tipo: 'entrata' | 'uscita';
  stato: 'da_pagare' | 'parziale' | 'pagato' | 'scaduto' | 'in_contestazione';
  soggetto_id: string;
  cantiere_id?: string | null;
  conto_banca_id?: string | null;
  descrizione?: string;
  metodo_pagamento?: string;
  categoria?: string | null;
  fattura_vendita_id?: string | null;
  file_url?: string | null;
  auto_domiciliazione?: boolean;
  fonte?: 'mutuo' | 'titolo' | 'fattura' | 'manuale' | null;
  aliquota_iva?: number | null;
}

export interface ScadenzaWithSoggetto extends ScadenzaPagamento {
  anagrafica_soggetti?: {
    ragione_sociale: string;
    partita_iva?: string;
    iban?: string;
    telefono?: string;
  };
  cantieri?: {
    codice: string;
    nome: string;
  };
  conti_banca?: {
    nome_banca: string;
    nome_conto: string;
  } | null;
  titolo?: {
    id: string;
    tipo?: 'assegno' | 'cambiale';
    numero_titolo?: string | null;
    file_url?: string | null;
  } | null;
}

export interface ScadenzaCantiereAllocation {
  id: string;
  scadenza_id: string;
  cantiere_id: string;
  importo: number;
  note?: string;
  cantieri?: {
    codice: string;
    nome: string;
  };
}

export interface ContoSummary {
  id: string;
  nome_banca: string;
  nome_conto: string;
  iban?: string;
  saldo_attuale: number;
  saldo_aggiornato_al?: string;
  movimenti_da_riconciliare: number;
  ultimo_upload_anno?: number;
  ultimo_upload_mese?: number;
}

// =====================================================
// MUTUI
// =====================================================

export interface Mutuo {
  id: string;
  conto_banca_id: string;
  numero_pratica?: string | null;
  banca_erogante: string;
  soggetto_id?: string | null;
  numero_rate: number;
  scopo?: string | null;
  capitale_erogato: number;
  tipo_tasso: 'fisso' | 'variabile' | 'misto';
  taeg_isc?: number | null;
  spese_istruttoria?: number;
  spese_perizia?: number;
  spese_incasso_rata?: number;
  spese_gestione_pratica?: number;
  periodicita: 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';
  data_stipula?: string | null;
  data_prima_rata?: string | null;
  stato: 'attivo' | 'estinto' | 'sospeso';
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RataMutuo {
  id: string;
  mutuo_id: string;
  numero_rata: number;
  importo_rata: number;
  importo_capitale?: number | null;
  importo_interessi?: number | null;
  data_scadenza: string;
  stato: 'da_pagare' | 'pagato' | 'scaduto';
  data_pagamento?: string | null;
  movimento_banca_id?: string | null;
  scadenza_id?: string | null;
  created_at?: string;
}

export interface MutuoConRate extends Mutuo {
  rate_pagate: number;
  rate_rimanenti: number;
  prossima_scadenza?: string | null;
  importo_rata?: number;
  conti_banca?: { nome_banca: string; nome_conto: string } | null;
}

export interface DocumentoMutuo {
  id: string;
  mutuo_id: string;
  nome_file: string;
  url_documento: string;
  tipo_documento?: string | null;
  created_at?: string;
}

// =====================================================
// TITOLI (Assegni, Cambiali)
// =====================================================

export interface Titolo {
  id: string;
  tipo: 'assegno' | 'cambiale';
  soggetto_id?: string | null;
  importo: number;
  data_scadenza: string;
  data_emissione?: string | null;
  banca_incasso?: string | null;
  numero_titolo?: string | null;
  stato: 'in_essere' | 'pagato' | 'protestato' | 'annullato';
  data_pagamento?: string | null;
  movimento_banca_id?: string | null;
  scadenza_id?: string | null;
  file_url?: string | null;
  note?: string | null;
  ocr_data?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  anagrafica_soggetti?: { ragione_sociale: string } | null;
}