-- Aggiunge importo_effettivo a rate_mutuo per tracciare il costo reale vs preventivato
ALTER TABLE rate_mutuo ADD COLUMN IF NOT EXISTS importo_effettivo DECIMAL(10,2);

COMMENT ON COLUMN rate_mutuo.importo_rata IS 'Importo rata preventivato (piano ammortamento)';
COMMENT ON COLUMN rate_mutuo.importo_effettivo IS 'Importo effettivamente addebitato dalla banca (da movimento bancario)';
