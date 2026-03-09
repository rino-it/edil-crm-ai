-- =====================================================
-- MIGRAZIONE: Aggiunge titolo_id a scadenze_pagamento
-- Permette di linkare una scadenza a un titolo (assegno/cambiale)
-- Un titolo può coprire N scadenze (relazione many-to-one inversa)
-- =====================================================

-- 1. Aggiungi colonna titolo_id a scadenze_pagamento
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS titolo_id UUID REFERENCES titoli(id) ON DELETE SET NULL;

-- 2. Commento per documentare il funzionamento
COMMENT ON COLUMN scadenze_pagamento.titolo_id IS 
'Referenza al titolo (assegno/cambiale) che copre/paga questa scadenza. 
Se NOT NULL, questa scadenza è garantita/coperta da un titolo emesso. 
Nel KPI esposizione, le righe con titolo_id IS NOT NULL sono escluse 
dal calcolo (il titolo è il consolidamento di più movimenti in uno).';

-- 3. Crea indice per query veloci
CREATE INDEX IF NOT EXISTS idx_scadenze_titolo_id ON scadenze_pagamento(titolo_id);

-- 4. Notifica PostgREST di ricaricare lo schema
NOTIFY pgrst, 'reload schema';
