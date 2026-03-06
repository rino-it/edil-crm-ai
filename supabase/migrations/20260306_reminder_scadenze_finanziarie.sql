-- ============================================================
-- Migrazione: Notifiche WhatsApp scadenze finanziarie
-- Data: 2026-03-06
-- ============================================================

-- 1. Aggiungere whatsapp_gruppo_soci a parametri_globali
ALTER TABLE parametri_globali
  ADD COLUMN IF NOT EXISTS whatsapp_gruppo_soci text;

-- 2. Aggiungere colonne reminder a scadenze_pagamento
ALTER TABLE scadenze_pagamento
  ADD COLUMN IF NOT EXISTS reminder_45gg_inviato boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_20gg_inviato boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_7gg_inviato boolean NOT NULL DEFAULT false;

-- 3. Indice per query cron: scadenze non pagate con reminder pendenti
CREATE INDEX IF NOT EXISTS idx_scadenze_reminder_pending
  ON scadenze_pagamento (data_scadenza)
  WHERE stato NOT IN ('pagato') 
    AND (reminder_45gg_inviato = false OR reminder_20gg_inviato = false OR reminder_7gg_inviato = false);
