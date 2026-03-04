-- Aggiunge conto_destinazione_id ai movimenti bancari
-- Usato per tracciare il conto destinazione dei giroconti/ricariche carta
ALTER TABLE movimenti_banca
  ADD COLUMN IF NOT EXISTS conto_destinazione_id UUID REFERENCES conti_banca(id);

CREATE INDEX IF NOT EXISTS idx_movimenti_banca_conto_destinazione_id
  ON movimenti_banca(conto_destinazione_id);
