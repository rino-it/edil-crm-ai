-- ============================================================
-- MIGRAZIONE: Modulo "Costo Reale Orario"
-- Data: 2026-02-19
-- Aggiunge colonne e tabelle per il calcolo dinamico del
-- costo reale orario per dipendente con supervisione umana.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELLA personale: nuove colonne
-- ------------------------------------------------------------
ALTER TABLE personale
  ADD COLUMN IF NOT EXISTS costo_config       JSONB,
  ADD COLUMN IF NOT EXISTS indirizzo_partenza TEXT,
  ADD COLUMN IF NOT EXISTS lat_partenza       NUMERIC,
  ADD COLUMN IF NOT EXISTS lng_partenza       NUMERIC;

-- ------------------------------------------------------------
-- 2. TABELLA cantieri: coordinate geografiche
-- ------------------------------------------------------------
ALTER TABLE cantieri
  ADD COLUMN IF NOT EXISTS lat_cantiere  NUMERIC,
  ADD COLUMN IF NOT EXISTS lng_cantiere  NUMERIC;

-- ------------------------------------------------------------
-- 3. TABELLA personale_documenti: colonne mancanti
--    (la tabella esiste già ma manca dati_validati e stato)
-- ------------------------------------------------------------
ALTER TABLE personale_documenti
  ADD COLUMN IF NOT EXISTS dati_validati       JSONB,
  ADD COLUMN IF NOT EXISTS stato               TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza', 'validato', 'rifiutato')),
  ADD COLUMN IF NOT EXISTS categoria_documento TEXT;

-- Rinomina categoria → categoria_documento se necessario
-- (la colonna "categoria" esiste già, la usiamo come alias)
-- Se vuoi unificarle, esegui:
-- UPDATE personale_documenti SET categoria_documento = categoria WHERE categoria_documento IS NULL;

-- ------------------------------------------------------------
-- 4. TABELLA parametri_globali: aliquote CCNL per livello
-- ------------------------------------------------------------
ALTER TABLE parametri_globali
  ADD COLUMN IF NOT EXISTS aliquote_ccnl JSONB;

-- Valore di default con struttura aliquote CCNL Edilizia
-- (percentuali come decimali: 0.30 = 30%)
UPDATE parametri_globali
SET aliquote_ccnl = '{
  "inps": 0.2835,
  "inail": 0.0380,
  "edilcassa": 0.0420,
  "tfr": 0.0770,
  "ferie_permessi": 0.1200,
  "livelli": {
    "1": { "paga_base": 8.50,  "label": "Livello 1 - Manovale" },
    "2": { "paga_base": 9.80,  "label": "Livello 2 - Operaio comune" },
    "3": { "paga_base": 11.20, "label": "Livello 3 - Operaio qualificato" },
    "4": { "paga_base": 12.50, "label": "Livello 4 - Operaio specializzato" },
    "5": { "paga_base": 14.00, "label": "Livello 5 - Caposquadra" },
    "6": { "paga_base": 16.50, "label": "Livello 6 - Impiegato tecnico" }
  }
}'::jsonb
WHERE aliquote_ccnl IS NULL;

-- ------------------------------------------------------------
-- 5. INDICI per performance
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_personale_documenti_personale_id
  ON personale_documenti(personale_id);

CREATE INDEX IF NOT EXISTS idx_personale_documenti_stato
  ON personale_documenti(stato);

CREATE INDEX IF NOT EXISTS idx_personale_documenti_scadenza
  ON personale_documenti(data_scadenza)
  WHERE data_scadenza IS NOT NULL;
