-- Aggiunge importo_pianificato per scheduling parziale nel cashflow
-- Se NULL o 0, si usa l'intero importo residuo (comportamento attuale)
-- Se valorizzato, solo quell'importo va nella settimana pianificata;
-- il resto (residuo - importo_pianificato) va in "Da Pianificare"
ALTER TABLE scadenze_pagamento ADD COLUMN IF NOT EXISTS importo_pianificato DECIMAL(12,2);

COMMENT ON COLUMN scadenze_pagamento.importo_pianificato IS 'Importo parziale pianificato per la data_pianificata. Se NULL = intero residuo.';
