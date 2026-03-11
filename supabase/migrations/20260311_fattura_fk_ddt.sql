-- Migrazione: FK fattura_fornitore_id su scadenze_pagamento + colonna ddt_riferimento su scadenze_cantiere
-- Data: 2026-03-11

-- 1. FK rigida verso fatture_fornitori sulle scadenze
--    Consente JOIN per UUID invece di match testuale su numero_fattura
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS fattura_fornitore_id UUID REFERENCES fatture_fornitori(id);

CREATE INDEX IF NOT EXISTS idx_scadenze_pagamento_fattura_fornitore_id
  ON scadenze_pagamento(fattura_fornitore_id);

-- 2. Colonna ddt_riferimento su scadenze_cantiere
--    Storicizza quale DDT ha originato l'allocazione, per suggerimenti futuri
ALTER TABLE scadenze_cantiere
  ADD COLUMN IF NOT EXISTS ddt_riferimento TEXT;
