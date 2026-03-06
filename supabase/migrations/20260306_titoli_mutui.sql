-- =====================================================
-- MIGRAZIONE: Gestione Titoli e Mutui
-- Da eseguire nel SQL Editor di Supabase
-- =====================================================

-- 1. Tabella MUTUI
CREATE TABLE IF NOT EXISTS mutui (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conto_banca_id UUID REFERENCES conti_banca(id) ON DELETE CASCADE NOT NULL,
  numero_pratica TEXT,
  banca_erogante TEXT NOT NULL,
  soggetto_id UUID REFERENCES anagrafica_soggetti(id),
  numero_rate INTEGER NOT NULL,
  scopo TEXT,
  capitale_erogato DECIMAL(12,2) NOT NULL,
  tipo_tasso TEXT CHECK (tipo_tasso IN ('fisso', 'variabile', 'misto')),
  taeg_isc DECIMAL(5,4),
  spese_istruttoria DECIMAL(10,2) DEFAULT 0,
  spese_perizia DECIMAL(10,2) DEFAULT 0,
  spese_incasso_rata DECIMAL(10,2) DEFAULT 0,
  spese_gestione_pratica DECIMAL(10,2) DEFAULT 0,
  periodicita TEXT DEFAULT 'mensile' CHECK (periodicita IN ('mensile', 'trimestrale', 'semestrale', 'annuale')),
  data_stipula DATE,
  data_prima_rata DATE,
  stato TEXT DEFAULT 'attivo' CHECK (stato IN ('attivo', 'estinto', 'sospeso')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mutui_conto ON mutui(conto_banca_id);
CREATE INDEX IF NOT EXISTS idx_mutui_stato ON mutui(stato);

-- 2. Tabella RATE_MUTUO
CREATE TABLE IF NOT EXISTS rate_mutuo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mutuo_id UUID REFERENCES mutui(id) ON DELETE CASCADE NOT NULL,
  numero_rata INTEGER NOT NULL,
  importo_rata DECIMAL(10,2) NOT NULL,
  importo_capitale DECIMAL(10,2),
  importo_interessi DECIMAL(10,2),
  data_scadenza DATE NOT NULL,
  stato TEXT DEFAULT 'da_pagare' CHECK (stato IN ('da_pagare', 'pagato', 'scaduto')),
  data_pagamento DATE,
  movimento_banca_id UUID,
  scadenza_id UUID REFERENCES scadenze_pagamento(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_mutuo_mutuo ON rate_mutuo(mutuo_id);
CREATE INDEX IF NOT EXISTS idx_rate_mutuo_stato ON rate_mutuo(stato);
CREATE INDEX IF NOT EXISTS idx_rate_mutuo_scadenza ON rate_mutuo(data_scadenza);

-- 3. Tabella TITOLI (assegni, cambiali)
CREATE TABLE IF NOT EXISTS titoli (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('assegno', 'cambiale')),
  soggetto_id UUID REFERENCES anagrafica_soggetti(id),
  importo DECIMAL(10,2) NOT NULL,
  data_scadenza DATE NOT NULL,
  data_emissione DATE,
  banca_incasso TEXT,
  numero_titolo TEXT,
  stato TEXT DEFAULT 'in_essere' CHECK (stato IN ('in_essere', 'pagato', 'protestato', 'annullato')),
  data_pagamento DATE,
  movimento_banca_id UUID,
  scadenza_id UUID REFERENCES scadenze_pagamento(id),
  file_url TEXT,
  note TEXT,
  ocr_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_titoli_stato ON titoli(stato);
CREATE INDEX IF NOT EXISTS idx_titoli_scadenza ON titoli(data_scadenza);
CREATE INDEX IF NOT EXISTS idx_titoli_tipo ON titoli(tipo);

-- 4. Tabella DOCUMENTI_MUTUO (archivio documentale)
CREATE TABLE IF NOT EXISTS documenti_mutuo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mutuo_id UUID REFERENCES mutui(id) ON DELETE CASCADE NOT NULL,
  nome_file TEXT NOT NULL,
  url_documento TEXT NOT NULL,
  tipo_documento TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Nuove colonne su scadenze_pagamento
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS auto_domiciliazione BOOLEAN DEFAULT FALSE;

ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS fonte TEXT;

COMMENT ON COLUMN scadenze_pagamento.auto_domiciliazione IS 'True se pagamento avviene tramite domiciliazione bancaria (SDD/RID)';
COMMENT ON COLUMN scadenze_pagamento.fonte IS 'Origine della scadenza: mutuo, titolo, fattura, manuale';

-- Notifica PostgREST di ricaricare lo schema
NOTIFY pgrst, 'reload schema';
