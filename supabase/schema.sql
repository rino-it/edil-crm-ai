-- ============================================================
-- SCHEMA EDIL CRM AI - Schema completo con tutte le tabelle
-- Eseguire in ordine su Supabase SQL Editor
-- ============================================================

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
  ai_response jsonb,      -- La risposta strutturata dell'AI
  interaction_step text,  -- Stato macchina conversazione
  temp_data jsonb         -- Dati temporanei conversazione multi-step
);

-- ============================================================
-- FASE 1: AGGIORNAMENTI PER MODULO COSTO REALE ORARIO
-- ============================================================

-- 7. Aggiornamento tabella PERSONALE
-- Aggiunge colonne per costo dinamico e indirizzo partenza
alter table public.personale
  add column if not exists costo_config jsonb default '{}'::jsonb,
  add column if not exists indirizzo_partenza text,
  add column if not exists lat_partenza numeric,
  add column if not exists lng_partenza numeric;

-- Commento colonne personale
comment on column public.personale.costo_config is
  'Profilo di Costo Dinamico: {"paga_base":1500, "aliquota_inps":0.0919, "aliquota_inail":0.003, "aliquota_edilcassa":0.015, "tfr":0.0741, "maggiorazione_straordinari":1.25, "incidenza_ferie":0.1082, "trasferta_giornaliera":50}';
comment on column public.personale.indirizzo_partenza is
  'Indirizzo di residenza/sede del dipendente per calcolo distanza cantiere';

-- 8. Aggiornamento tabella CANTIERI
-- Assicura la presenza di coordinate GPS per calcolo distanza
alter table public.cantieri
  add column if not exists indirizzo text,
  add column if not exists lat_cantiere numeric,
  add column if not exists lng_cantiere numeric;

-- 9. Nuova tabella PERSONALE_DOCUMENTI
-- Archiviazione documenti (contratti, visite mediche, corsi)
create table if not exists public.personale_documenti (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  personale_id uuid not null references public.personale(id) on delete cascade,
  url_file text,
  categoria_documento text not null check (
    categoria_documento in ('contratto', 'visita_medica', 'corso_sicurezza')
  ),
  data_scadenza date,
  data_documento date,
  dati_estratti jsonb default '{}'::jsonb,
  -- Dati validati dall'utente (dopo human review)
  dati_validati jsonb default '{}'::jsonb,
  stato text default 'bozza' check (stato in ('bozza', 'validato', 'scaduto')),
  note text
);

comment on table public.personale_documenti is
  'Documenti allegati al personale: contratti, visite mediche, attestati corsi sicurezza';
comment on column public.personale_documenti.dati_estratti is
  'Output grezzo dell''AI con confidence scores. NON salvato finché non validato dall''utente.';
comment on column public.personale_documenti.dati_validati is
  'Dati confermati dall''utente. Questi alimentano il costo_config del personale.';

-- 10. Nuova tabella PARAMETRI_GLOBALI (Knowledge Base aziendale)
-- Tabella chiave-valore per aliquote CCNL e parametri di sistema
create table if not exists public.parametri_globali (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  chiave text not null unique,
  valore jsonb not null,
  descrizione text,
  categoria text default 'generale' check (
    categoria in ('aliquote_ccnl', 'trasferta', 'orari', 'ferie', 'generale')
  )
);

comment on table public.parametri_globali is
  'Knowledge Base aziendale: aliquote CCNL per livello, parametri trasferta, orari standard';

-- Dati iniziali: Aliquote CCNL Edilizia 2024/2025
insert into public.parametri_globali (chiave, valore, descrizione, categoria) values
  ('ccnl_edilizia_livelli', '{
    "1": {"descrizione": "Operaio comune", "paga_base_oraria": 9.20, "inps_carico_azienda": 0.2315, "inail": 0.030, "edilcassa": 0.020, "tfr": 0.0741, "incidenza_ferie_permessi": 0.1082},
    "2": {"descrizione": "Operaio qualificato", "paga_base_oraria": 10.10, "inps_carico_azienda": 0.2315, "inail": 0.030, "edilcassa": 0.020, "tfr": 0.0741, "incidenza_ferie_permessi": 0.1082},
    "3": {"descrizione": "Operaio specializzato", "paga_base_oraria": 11.20, "inps_carico_azienda": 0.2315, "inail": 0.025, "edilcassa": 0.020, "tfr": 0.0741, "incidenza_ferie_permessi": 0.1082},
    "4": {"descrizione": "Capo squadra", "paga_base_oraria": 12.50, "inps_carico_azienda": 0.2315, "inail": 0.025, "edilcassa": 0.018, "tfr": 0.0741, "incidenza_ferie_permessi": 0.1082},
    "5": {"descrizione": "Impiegato tecnico", "paga_base_oraria": 14.00, "inps_carico_azienda": 0.2315, "inail": 0.015, "edilcassa": 0.015, "tfr": 0.0741, "incidenza_ferie_permessi": 0.1082}
  }', 'Aliquote CCNL Edilizia per livello di inquadramento', 'aliquote_ccnl'),

  ('trasferta_soglia_km', '30', 'Distanza minima in km per attivare indennità trasferta', 'trasferta'),

  ('trasferta_indennita_giornaliera', '50.00', 'Indennità trasferta giornaliera in euro', 'trasferta'),

  ('ore_turno_standard', '8', 'Ore di turno standard giornaliero prima degli straordinari', 'orari'),

  ('maggiorazione_straordinari', '1.25', 'Coefficiente moltiplicativo per ore straordinarie (es. 1.25 = +25%)', 'orari'),

  ('admin_whatsapp', '"inserire-numero-admin"', 'Numero WhatsApp amministratore per alert scadenze', 'generale')

on conflict (chiave) do nothing;

-- ============================================================
-- INDICI PER PERFORMANCE
-- ============================================================

create index if not exists idx_personale_documenti_personale_id
  on public.personale_documenti(personale_id);

create index if not exists idx_personale_documenti_scadenza
  on public.personale_documenti(data_scadenza)
  where data_scadenza is not null;

create index if not exists idx_personale_documenti_categoria
  on public.personale_documenti(categoria_documento);

create index if not exists idx_parametri_globali_chiave
  on public.parametri_globali(chiave);

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table public.materiali enable row level security;
alter table public.chat_log enable row level security;
alter table public.personale_documenti enable row level security;
alter table public.parametri_globali enable row level security;

-- Drop policies se già esistono (idempotente)
drop policy if exists "Accesso materiali" on public.materiali;
drop policy if exists "Accesso chat_log" on public.chat_log;
drop policy if exists "Accesso personale_documenti" on public.personale_documenti;
drop policy if exists "Accesso parametri_globali" on public.parametri_globali;

create policy "Accesso materiali"
  on public.materiali for all using (auth.role() = 'authenticated');

create policy "Accesso chat_log"
  on public.chat_log for all using (auth.role() = 'authenticated');

create policy "Accesso personale_documenti"
  on public.personale_documenti for all using (auth.role() = 'authenticated');

create policy "Accesso parametri_globali"
  on public.parametri_globali for all using (auth.role() = 'authenticated');

-- ============================================================
-- FUNZIONE: Aggiorna updated_at automaticamente
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists on_parametri_globali_updated on public.parametri_globali;
create trigger on_parametri_globali_updated
  before update on public.parametri_globali
  for each row execute procedure public.handle_updated_at();
