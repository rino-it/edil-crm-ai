-- ... (tabelle cantieri, movimenti, users già presenti) ...

-- 5. Tabella MATERIALI (Se esiste già nel DB, assicurati che abbia queste colonne)
create table if not exists public.materiali (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  nome text not null,
  unita_misura text, -- es. "kg", "mq", "pz"
  costo_unitario_default numeric
);

-- 6. Tabella CHAT_LOG (ESSENZIALE per Fase 3 - AI & WhatsApp)
create table if not exists public.chat_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  raw_text text,          -- Il messaggio originale ricevuto da WhatsApp
  media_url text,         -- URL della foto (se presente)
  sender_number text,     -- Numero di telefono del mittente (es. capocantiere)
  status_ai text default 'pending', -- Stati: 'pending', 'processed', 'error'
  ai_response jsonb       -- La risposta strutturata dell'AI
);

-- Abilita RLS per sicurezza
alter table public.materiali enable row level security;
alter table public.chat_log enable row level security;

-- Policy di accesso (modifica se necessario)
create policy "Accesso materiali" on public.materiali for all using (auth.role() = 'authenticated');
create policy "Accesso chat_log" on public.chat_log for all using (auth.role() = 'authenticated');