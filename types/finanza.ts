import { Soggetto } from "@/utils/data-fetcher"; // Importa la tua interfaccia esistente

export interface ScadenzaPagamento {
  id: string;
  fattura_riferimento?: string;
  importo_totale: number;
  importo_pagato: number;
  data_scadenza: string;
  data_emissione?: string;
  data_pagamento?: string;
  tipo: 'entrata' | 'uscita';
  stato: 'da_pagare' | 'parziale' | 'pagato' | 'scaduto' | 'in_contestazione';
  soggetto_id: string;
  cantiere_id?: string | null;
  descrizione?: string;
  metodo_pagamento?: string;
  categoria?: string | null;
  fattura_vendita_id?: string | null;
}

export interface ScadenzaWithSoggetto extends ScadenzaPagamento {
  anagrafica_soggetti?: {
    ragione_sociale: string;
    partita_iva?: string;
    iban?: string;
  };
  cantieri?: {
    codice: string;
    titolo: string;
  };
}

export interface ScadenzaCantiereAllocation {
  id: string;
  scadenza_id: string;
  cantiere_id: string;
  importo: number;
  note?: string;
  cantieri?: {
    codice: string;
    titolo: string;
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