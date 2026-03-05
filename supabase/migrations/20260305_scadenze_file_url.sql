-- Aggiunge colonna file_url a scadenze_pagamento
-- per salvare URL del documento originale (foto WhatsApp, PDF, etc.)
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS file_url text;

COMMENT ON COLUMN scadenze_pagamento.file_url IS 'URL del documento originale (foto WhatsApp, PDF, etc.)';

-- Notifica PostgREST di ricaricare lo schema
NOTIFY pgrst, 'reload schema';
