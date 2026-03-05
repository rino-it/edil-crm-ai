-- Aggiunge colonna file_url a scadenze_pagamento
-- per salvare URL del documento originale (foto WhatsApp, PDF, etc.)
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS file_url text;

COMMENT ON COLUMN scadenze_pagamento.file_url IS 'URL del documento originale (foto WhatsApp, PDF, etc.)';

-- Rendi piva_fornitore nullable (il match ora avviene per ragione_sociale)
ALTER TABLE fatture_fornitori
  ALTER COLUMN piva_fornitore DROP NOT NULL;

-- Notifica PostgREST di ricaricare lo schema
NOTIFY pgrst, 'reload schema';
