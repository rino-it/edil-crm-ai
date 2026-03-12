-- Fix: escludere fonte='mutuo' dai KPI scadenziario (allineamento con anagrafe debiti)
-- La RPC precedente includeva le rate mutuo nel totale "daPagare" e "scaduto",
-- gonfiando i numeri di ~14k rispetto ai debiti fornitori reali.

CREATE OR REPLACE FUNCTION get_scadenze_kpis() RETURNS JSON AS $$
  SELECT json_build_object(
    'daIncassare', COALESCE(SUM(CASE WHEN tipo='entrata' AND stato IN ('da_pagare','parziale')
                   THEN importo_totale - COALESCE(importo_pagato, 0) END), 0),
    'daPagare', COALESCE(SUM(CASE WHEN tipo='uscita' AND stato IN ('da_pagare','parziale')
                THEN importo_totale - COALESCE(importo_pagato, 0) END), 0),
    'scaduto', COALESCE(SUM(CASE WHEN stato='scaduto'
               THEN importo_totale - COALESCE(importo_pagato, 0) END), 0),
    'daSmistare', (SELECT COUNT(*) FROM v_scadenze_da_smistare),
    'dso', COALESCE((SELECT ROUND(AVG(EXTRACT(DAY FROM data_pagamento::timestamp - data_emissione::timestamp)))
           FROM scadenze_pagamento WHERE tipo='entrata' AND stato='pagato'
           AND data_pagamento > CURRENT_DATE - INTERVAL '90 days'), 0)
  ) FROM scadenze_pagamento
  WHERE stato != 'pagato'
    AND (fonte IS NULL OR fonte != 'mutuo');
$$ LANGUAGE sql STABLE;
