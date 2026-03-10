-- Aggiunge aliquota_iva a scadenze_pagamento per scorporo IVA nei costi cantiere
-- Valori possibili: 0 (esente/professionista), 4, 10, 22
-- Se NULL, default 22% nelle viste
ALTER TABLE scadenze_pagamento ADD COLUMN IF NOT EXISTS aliquota_iva SMALLINT;

COMMENT ON COLUMN scadenze_pagamento.aliquota_iva IS 'Aliquota IVA (0=esente, 4, 10, 22). NULL = non specificata (default 22%).';
