-- 1. Tabella Cantieri
CREATE TABLE cantieri (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  indirizzo TEXT,
  budget_stimato DECIMAL(12,2) DEFAULT 0,
  stato TEXT DEFAULT 'in_corso',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabella Movimenti
CREATE TABLE movimenti (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descrizione TEXT,
  importo DECIMAL(12,2) NOT NULL,
  fornitore TEXT,
  data_movimento DATE DEFAULT CURRENT_DATE,
  file_url TEXT,
  ai_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabella Log WhatsApp
CREATE TABLE whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mittente TEXT NOT NULL,
  messaggio_raw JSONB,
  elaborato BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);