-- Aggiunge conto_banca_id a scadenze_pagamento per cashflow per-conto
-- e per assegnare rate mutuo al conto corretto

ALTER TABLE public.scadenze_pagamento
ADD COLUMN IF NOT EXISTS conto_banca_id uuid REFERENCES public.conti_banca(id);

-- Indice per il raggruppamento cashflow per-conto
CREATE INDEX IF NOT EXISTS idx_scadenze_conto_banca
ON public.scadenze_pagamento(conto_banca_id)
WHERE conto_banca_id IS NOT NULL;
