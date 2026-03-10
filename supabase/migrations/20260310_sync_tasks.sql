-- Tabella task queue per sincronizzazione dati via agent locale
create table if not exists sync_tasks (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',   -- pending | running | completed | error
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  results jsonb,
  requested_by uuid references auth.users(id),
  error text
);

-- Solo l'utente che ha creato il task può leggerlo
alter table sync_tasks enable row level security;

create policy "Utente vede i propri task"
  on sync_tasks for select
  using (auth.uid() = requested_by);

create policy "Utente può inserire task"
  on sync_tasks for insert
  with check (auth.uid() = requested_by);

-- L'agent locale usa service_role e bypassa RLS per update
-- (nessuna policy INSERT/UPDATE per service_role necessaria)

-- Index per poll efficiente dell'agent
create index if not exists sync_tasks_status_idx on sync_tasks(status) where status = 'pending';
