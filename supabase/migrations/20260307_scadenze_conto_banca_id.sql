-- Collega le scadenze a un conto bancario specifico (nullable = pool generico)
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS conto_banca_id UUID REFERENCES conti_banca(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca_id
  ON scadenze_pagamento(conto_banca_id);

-- Backfill: eredita conto da movimenti riconciliati
UPDATE scadenze_pagamento sp
SET conto_banca_id = mb.conto_banca_id
FROM movimenti_banca mb
WHERE mb.scadenza_id = sp.id
  AND mb.conto_banca_id IS NOT NULL
  AND sp.conto_banca_id IS NULL;

-- Backfill: rate mutuo ereditano conto dal mutuo padre
UPDATE scadenze_pagamento sp
SET conto_banca_id = m.conto_banca_id
FROM rate_mutuo rm
JOIN mutui m ON m.id = rm.mutuo_id
WHERE rm.scadenza_id = sp.id
  AND sp.conto_banca_id IS NULL;

NOTIFY pgrst, 'reload schema';
