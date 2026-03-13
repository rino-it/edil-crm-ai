-- Abilita pg_trgm (gia' presente ma sicurezza)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indice GIN trigram su ragione_sociale per ricerche fuzzy veloci
CREATE INDEX IF NOT EXISTS idx_anagrafica_soggetti_ragione_sociale_trgm
ON anagrafica_soggetti USING gin (ragione_sociale gin_trgm_ops);

-- Funzione RPC: cerca il miglior match soggetto con strategia a tier
CREATE OR REPLACE FUNCTION match_soggetto(
  p_nome text,
  p_partita_iva text DEFAULT NULL,
  p_limit int DEFAULT 3
)
RETURNS TABLE(
  id uuid,
  ragione_sociale text,
  partita_iva text,
  codice_fiscale text,
  condizioni_pagamento text,
  match_type text,
  confidence float
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_piva_clean text;
BEGIN
  -- Pulisci PIVA: rimuovi prefisso paese (IT, etc.)
  IF p_partita_iva IS NOT NULL AND length(p_partita_iva) > 0 THEN
    v_piva_clean := regexp_replace(p_partita_iva, '^[A-Za-z]{2}', '');
    IF length(v_piva_clean) < 5 THEN
      v_piva_clean := NULL;
    END IF;
  END IF;

  -- Tier 0: Match esatto per PIVA
  IF v_piva_clean IS NOT NULL THEN
    RETURN QUERY
    SELECT
      s.id, s.ragione_sociale, s.partita_iva, s.codice_fiscale,
      s.condizioni_pagamento,
      'piva'::text AS match_type,
      1.0::float AS confidence
    FROM anagrafica_soggetti s
    WHERE s.partita_iva = v_piva_clean
       OR s.codice_fiscale = v_piva_clean
       OR s.partita_iva = p_partita_iva
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Tier 1: Match esatto case-insensitive su ragione_sociale
  RETURN QUERY
  SELECT
    s.id, s.ragione_sociale, s.partita_iva, s.codice_fiscale,
    s.condizioni_pagamento,
    'esatto'::text AS match_type,
    1.0::float AS confidence
  FROM anagrafica_soggetti s
  WHERE lower(trim(s.ragione_sociale)) = lower(trim(p_nome))
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Tier 2: Fuzzy con word_similarity bidirezionale
  -- word_similarity(a, b) controlla se le parole di 'a' appaiono in 'b'
  -- Bidirezionale: MAX(ws(input, db), ws(db, input)) per catturare sia
  -- "EDILCASSA" dentro "EDILCASSA ARTIGIANA DI BERGAMO" che viceversa
  RETURN QUERY
  SELECT
    s.id, s.ragione_sociale, s.partita_iva, s.codice_fiscale,
    s.condizioni_pagamento,
    'fuzzy'::text AS match_type,
    GREATEST(
      word_similarity(lower(p_nome), lower(s.ragione_sociale)),
      word_similarity(lower(s.ragione_sociale), lower(p_nome))
    )::float AS confidence
  FROM anagrafica_soggetti s
  WHERE lower(p_nome) <% lower(s.ragione_sociale)
     OR lower(s.ragione_sociale) <% lower(p_nome)
  ORDER BY confidence DESC
  LIMIT p_limit;
END;
$$;
