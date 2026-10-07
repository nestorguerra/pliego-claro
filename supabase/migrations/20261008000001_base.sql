-- Pliego Claro · esquema base v1 (2026-10-08)
-- Contrato de datos: cada fila privada pertenece a un espacio (workspace) y la
-- autorización se comprueba en Postgres con RLS en cada operación, no en la interfaz.

-- Sin extensiones: gen_random_uuid() y sha256() forman parte de Postgres.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

do $$ begin
  create type public.member_role as enum ('viewer', 'editor', 'admin', 'owner');
exception when duplicate_object then null; end $$;

create or replace function app.role_rank(r public.member_role) returns int
language sql immutable set search_path = '' as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 when 'owner' then 4 end
$$;

-- ---------------------------------------------------------------------------
-- Personas, espacios y pertenencia
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  email text not null default '',
  email_alerts boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create or replace function public.has_role(ws uuid, min_role public.member_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and app.role_rank(m.role) >= app.role_rank(min_role)
  )
$$;
revoke all on function public.has_role(uuid, public.member_role) from public, anon;
grant execute on function public.has_role(uuid, public.member_role) to authenticated;

create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  version int not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fuente oficial (PLACSP). Lectura para cualquier cuenta; escritura solo servidor.
-- ---------------------------------------------------------------------------
create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'PLACSP',
  external_id text not null unique,
  folder_id text,
  link text,
  title text not null,
  buyer text,
  buyer_nif text,
  buyer_city text,
  status_code text,
  contract_type text,
  procedure_code text,
  cpv text[] not null default '{}',
  nuts text,
  province text,
  amount_without_tax numeric,
  amount_with_tax numeric,
  estimated_value numeric,
  deadline_at timestamptz,
  deadline_text text,
  source_updated_at timestamptz,
  documents jsonb not null default '[]'::jsonb,
  lots jsonb not null default '[]'::jsonb,
  criteria jsonb not null default '[]'::jsonb,
  qualification jsonb not null default '[]'::jsonb,
  content_hash text not null,
  deleted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(buyer, '') || ' ' || coalesce(folder_id, '') || ' ' || coalesce(province, ''))
  ) stored
);
create index if not exists tenders_search_idx on public.tenders using gin (search);
create index if not exists tenders_cpv_idx on public.tenders using gin (cpv);
create index if not exists tenders_deadline_idx on public.tenders (deadline_at);
create index if not exists tenders_updated_idx on public.tenders (source_updated_at desc);

create table if not exists public.tender_versions (
  id bigint generated always as identity primary key,
  tender_id uuid not null references public.tenders (id) on delete cascade,
  content_hash text not null,
  snapshot jsonb not null,
  changes jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  detected_at timestamptz not null default now(),
  unique (tender_id, content_hash)
);

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  source text not null default 'PLACSP',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  pages int not null default 0,
  entries int not null default 0,
  upserts int not null default 0,
  changes int not null default 0,
  cursor_at timestamptz,
  error text
);

-- ---------------------------------------------------------------------------
-- Trabajo privado por espacio
-- ---------------------------------------------------------------------------
create table if not exists public.expedientes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 200),
  tender_id uuid references public.tenders (id) on delete set null,
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and length(trim(coalesce(data ->> 'title', ''))) > 0
    and coalesce(data ->> 'decision', '') in ('GO', 'REVISAR', 'NO-GO')
    and jsonb_typeof(coalesce(data -> 'requirements', '[]'::jsonb)) = 'array'
  ),
  schema_version int not null default 1,
  version int not null default 1,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, client_id)
);
create unique index if not exists expedientes_one_per_tender on public.expedientes (workspace_id, tender_id)
  where tender_id is not null and deleted_at is null;
create index if not exists expedientes_tender_idx on public.expedientes (tender_id) where tender_id is not null;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  expediente_client_id text not null default '',
  kind text not null default 'Nota' check (length(kind) <= 40),
  text text not null check (length(trim(text)) between 1 and 8000),
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, client_id)
);

create table if not exists public.team_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id text not null,
  name text not null check (length(trim(name)) between 1 and 120),
  role text not null check (length(trim(role)) between 1 and 120),
  note text not null default '',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, client_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expediente_id uuid not null references public.expedientes (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 300),
  kind text not null check (kind in ('PCAP', 'PPT', 'Anexo', 'Aclaración', 'Otro')),
  version_label text not null default '',
  origin text not null check (origin in ('upload', 'official')),
  source_url text,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  mime_type text not null,
  supersedes_id uuid references public.documents (id) on delete set null,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'done', 'partial', 'needs_ocr', 'failed', 'not_applicable')),
  page_count int,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (split_part(storage_path, '/', 1) = workspace_id::text)
);
create index if not exists documents_expediente_idx on public.documents (expediente_id);

create table if not exists public.document_pages (
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  page_number int not null check (page_number > 0),
  text text not null default '',
  method text not null default 'text' check (method in ('text', 'ocr')),
  created_at timestamptz not null default now(),
  primary key (document_id, page_number)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expediente_id uuid not null references public.expedientes (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expediente_id uuid references public.expedientes (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists activity_ws_idx on public.activity_log (workspace_id, created_at desc);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expediente_id uuid not null references public.expedientes (id) on delete cascade,
  tender_version_id bigint references public.tender_versions (id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null default '',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users (id) on delete set null,
  unique (expediente_id, tender_version_id)
);

create table if not exists public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id uuid references public.alerts (id) on delete cascade,
  subject text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%.__%'),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  expediente_id uuid not null references public.expedientes (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  cache_key text not null,
  model text not null,
  prompt_version text not null,
  status text not null check (status in ('running', 'done', 'failed', 'refused', 'blocked')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  result jsonb,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_cache_idx on public.ai_analyses (workspace_id, cache_key) where status = 'done';
create index if not exists ai_user_day_idx on public.ai_analyses (created_by, created_at);

create table if not exists public.app_limits (
  key text primary key,
  value numeric not null,
  note text not null default ''
);
insert into public.app_limits (key, value, note) values
  ('ai_monthly_budget_usd', 15, 'Corte de la aplicación: al alcanzarlo no se lanzan análisis nuevos.'),
  ('ai_user_daily_requests', 10, 'Análisis nuevos por persona y día (los reutilizados no cuentan).'),
  ('ai_max_input_chars', 300000, 'Caracteres máximos del documento enviados al modelo.'),
  ('ai_workspace_daily_requests', 25, 'Análisis nuevos por espacio y día.')
on conflict (key) do nothing;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  message text not null check (length(message) <= 500),
  context text not null default '' check (length(context) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Disparadores: alta de cuenta, versiones, auditoría
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ws uuid; display text;
begin
  display := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 120);
  insert into public.profiles (user_id, display_name, email) values (new.id, display, coalesce(new.email, ''))
    on conflict (user_id) do nothing;
  insert into public.workspaces (name, created_by)
    values (left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'company'), ''), 'Espacio de ' || display), 120), new.id)
    returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, new.id, 'owner');
  insert into public.workspace_settings (workspace_id, data, updated_by)
    values (ws, jsonb_build_object('workspaceName', left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'company'), ''), 'Espacio de ' || display), 120)), new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

create or replace function app.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where user_id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users for each row execute function app.sync_profile_email();

-- Concurrencia optimista: cada escritura debe partir de la última versión.
create or replace function app.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'conflicto de versión: esperado %, recibido %', old.version + 1, new.version using errcode = '40001';
  end if;
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists expedientes_version on public.expedientes;
create trigger expedientes_version before update on public.expedientes for each row execute function app.bump_version();
drop trigger if exists settings_version on public.workspace_settings;
create trigger settings_version before update on public.workspace_settings for each row execute function app.bump_version();

-- Campos inmutables: un expediente no puede cambiar de espacio.
create or replace function app.freeze_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id <> old.workspace_id then raise exception 'No se puede mover un registro a otro espacio.'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['expedientes', 'notes', 'team_roles', 'documents', 'comments'] loop
    execute format('drop trigger if exists %I_freeze on public.%I', t, t);
    execute format('create trigger %I_freeze before update on public.%I for each row execute function app.freeze_workspace()', t, t);
  end loop;
end $$;

create or replace function app.log_expediente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
      values (new.workspace_id, new.id, auth.uid(), 'expediente_creado', left(new.data ->> 'title', 300));
  elsif new.deleted_at is not null and old.deleted_at is null then
    insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
      values (new.workspace_id, new.id, auth.uid(), 'expediente_a_papelera', left(new.data ->> 'title', 300));
  elsif new.deleted_at is null and old.deleted_at is not null then
    insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
      values (new.workspace_id, new.id, auth.uid(), 'expediente_restaurado', left(new.data ->> 'title', 300));
  else
    label := new.data -> 'history' -> 0 ->> 'label';
    if label is distinct from (old.data -> 'history' -> 0 ->> 'label') then
      insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
        values (new.workspace_id, new.id, auth.uid(), 'expediente_editado', left(coalesce(label, ''), 300));
    else
      insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
        values (new.workspace_id, new.id, auth.uid(), 'expediente_editado', 'Cambio sin entrada de historial');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists expedientes_log on public.expedientes;
create trigger expedientes_log after insert or update on public.expedientes for each row execute function app.log_expediente();

create or replace function app.log_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_log (workspace_id, expediente_id, actor_id, action, detail)
    values (new.workspace_id, new.expediente_id, auth.uid(),
      case when tg_op = 'INSERT' then 'documento_archivado' when new.deleted_at is not null and old.deleted_at is null then 'documento_a_papelera' else 'documento_actualizado' end,
      left(new.name || ' · sha256 ' || left(new.sha256, 12), 300));
  return new;
end $$;
drop trigger if exists documents_log on public.documents;
create trigger documents_log after insert or update on public.documents for each row execute function app.log_document();

-- Cambio oficial detectado -> aviso por expediente vinculado (sin duplicados) y
-- reapertura de una decisión GO si cambia plazo, documentos o estado.
create or replace function app.on_tender_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e record; alert_id uuid; kinds text; reopen boolean; event jsonb; prev_count int;
begin
  select count(*) into prev_count from public.tender_versions where tender_id = new.tender_id and id < new.id;
  if prev_count = 0 then return new; end if; -- primera versión conocida: no es un cambio
  select string_agg(distinct c ->> 'field', ', ') into kinds from jsonb_array_elements(new.changes) c;
  reopen := exists (select 1 from jsonb_array_elements(new.changes) c where c ->> 'field' in ('deadline_at', 'documents', 'status_code'));
  for e in select x.id, x.workspace_id, x.data from public.expedientes x where x.tender_id = new.tender_id and x.deleted_at is null loop
    insert into public.alerts (workspace_id, expediente_id, tender_version_id, kind, title, detail, changes)
      values (e.workspace_id, e.id, new.id, 'cambio_oficial', 'Cambio en la fuente oficial: ' || coalesce(kinds, 'datos'),
              'Detectado en PLACSP el ' || to_char(new.detected_at at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') || ' (hora de Madrid).', new.changes)
      on conflict (expediente_id, tender_version_id) do nothing
      returning id into alert_id;
    if alert_id is null then continue; end if;
    event := jsonb_build_object('id', alert_id::text, 'kind', 'Cambio oficial', 'label', 'Cambio en ' || coalesce(kinds, 'datos'),
      'detail', 'PLACSP publicó una versión distinta. Revisa el antes y el después en Seguimiento.', 'at', to_jsonb(new.detected_at),
      'sourceLabel', 'PLACSP · oficial', 'requiresReview', true, 'reviewed', false, 'official', true, 'changes', new.changes);
    update public.expedientes x set
      version = x.version + 1,
      data = jsonb_set(
        case when reopen and x.data ->> 'decision' = 'GO'
          then jsonb_set(x.data - 'decisionConfirmedAt', '{decision}', '"REVISAR"')
          else x.data end,
        '{events}', coalesce(x.data -> 'events', '[]'::jsonb) || jsonb_build_array(event))
        || jsonb_build_object('history', jsonb_build_array(jsonb_build_object(
             'label', case when reopen and x.data ->> 'decision' = 'GO' then 'Decisión reabierta por cambio oficial' else 'Cambio oficial registrado' end,
             'detail', 'Campos: ' || coalesce(kinds, 'datos') || '. Se conservan evidencias, tareas y notas.',
             'at', to_jsonb(new.detected_at))) || coalesce(x.data -> 'history', '[]'::jsonb))
    where x.id = e.id;
  end loop;
  return new;
end $$;
drop trigger if exists tender_versions_alerts on public.tender_versions;
create trigger tender_versions_alerts after insert on public.tender_versions for each row execute function app.on_tender_version();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_versions enable row level security;
alter table public.sync_runs enable row level security;
alter table public.expedientes enable row level security;
alter table public.notes enable row level security;
alter table public.team_roles enable row level security;
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.alerts enable row level security;
alter table public.email_notifications enable row level security;
alter table public.invitations enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.app_limits enable row level security;
alter table public.client_errors enable row level security;

-- Lectura de perfiles: el propio y los de personas del mismo espacio.
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.user_id));
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workspaces_select on public.workspaces for select to authenticated using (public.has_role(id, 'viewer'));
create policy workspaces_update on public.workspaces for update to authenticated using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));

create policy members_select on public.workspace_members for select to authenticated using (public.has_role(workspace_id, 'viewer'));

create policy settings_select on public.workspace_settings for select to authenticated using (public.has_role(workspace_id, 'viewer'));
create policy settings_update on public.workspace_settings for update to authenticated using (public.has_role(workspace_id, 'editor')) with check (public.has_role(workspace_id, 'editor'));

create policy tenders_select on public.tenders for select to authenticated using (true);
create policy tender_versions_select on public.tender_versions for select to authenticated using (true);
create policy sync_runs_select on public.sync_runs for select to authenticated using (true);
create policy app_limits_select on public.app_limits for select to authenticated using (true);

do $$ declare t text; begin
  foreach t in array array['expedientes', 'notes', 'team_roles', 'documents', 'comments'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.has_role(workspace_id, ''viewer''))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_role(workspace_id, ''editor''))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_role(workspace_id, ''editor'')) with check (public.has_role(workspace_id, ''editor''))', t, t);
  end loop;
end $$;

-- Un documento solo puede colgar de un expediente del mismo espacio.
create or replace function app.check_document_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.expedientes x where x.id = new.expediente_id and x.workspace_id = new.workspace_id) then
    raise exception 'El expediente no pertenece a este espacio.';
  end if;
  if new.supersedes_id is not null and not exists (select 1 from public.documents d where d.id = new.supersedes_id and d.workspace_id = new.workspace_id) then
    raise exception 'La versión anterior no pertenece a este espacio.';
  end if;
  return new;
end $$;
drop trigger if exists documents_scope on public.documents;
create trigger documents_scope before insert or update on public.documents for each row execute function app.check_document_scope();
drop trigger if exists comments_scope on public.comments;
create or replace function app.check_comment_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.expedientes x where x.id = new.expediente_id and x.workspace_id = new.workspace_id) then
    raise exception 'El expediente no pertenece a este espacio.';
  end if;
  if tg_op = 'UPDATE' and (new.body <> old.body or new.author_id is distinct from old.author_id) and old.author_id is distinct from auth.uid() then
    raise exception 'Solo la autoría puede editar un comentario.';
  end if;
  if tg_op = 'INSERT' then new.author_id := auth.uid(); end if;
  return new;
end $$;
create trigger comments_scope before insert or update on public.comments for each row execute function app.check_comment_scope();

create policy pages_select on public.document_pages for select to authenticated using (public.has_role(workspace_id, 'viewer'));
create policy pages_insert on public.document_pages for insert to authenticated with check (
  public.has_role(workspace_id, 'editor') and exists (select 1 from public.documents d where d.id = document_id and d.workspace_id = document_pages.workspace_id));
create policy pages_update on public.document_pages for update to authenticated using (public.has_role(workspace_id, 'editor')) with check (public.has_role(workspace_id, 'editor'));

create policy activity_select on public.activity_log for select to authenticated using (public.has_role(workspace_id, 'viewer'));
create policy alerts_select on public.alerts for select to authenticated using (public.has_role(workspace_id, 'viewer'));
create policy email_select on public.email_notifications for select to authenticated using (user_id = auth.uid() or public.has_role(workspace_id, 'admin'));
create policy invitations_select on public.invitations for select to authenticated using (public.has_role(workspace_id, 'admin'));
create policy ai_select on public.ai_analyses for select to authenticated using (public.has_role(workspace_id, 'viewer'));
create policy client_errors_insert on public.client_errors for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Operaciones de servidor (RPC) con comprobación de permisos
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
  if (select count(*) from public.workspace_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'Límite de cinco espacios propios por cuenta en el piloto.';
  end if;
  insert into public.workspaces (name, created_by) values (left(trim(p_name), 120), auth.uid()) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into public.workspace_settings (workspace_id, data, updated_by) values (ws, jsonb_build_object('workspaceName', left(trim(p_name), 120)), auth.uid());
  return ws;
end $$;

create or replace function public.mark_alert_read(p_alert uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.alerts where id = p_alert;
  if ws is null or not public.has_role(ws, 'viewer') then raise exception 'Aviso no disponible.'; end if;
  update public.alerts set read_at = coalesce(read_at, now()), read_by = coalesce(read_by, auth.uid()) where id = p_alert;
end $$;

create or replace function public.create_invitation(p_workspace uuid, p_email text, p_role public.member_role) returns text
language plpgsql security definer set search_path = '' as $$
declare token text; clean text := lower(trim(p_email));
begin
  if not public.has_role(p_workspace, 'admin') then raise exception 'Solo administración puede invitar.'; end if;
  if p_role = 'owner' then raise exception 'La titularidad no se cede por invitación.'; end if;
  if exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_workspace and lower(u.email) = clean) then
    raise exception 'Esa persona ya es miembro del espacio.';
  end if;
  update public.invitations set revoked_at = now() where workspace_id = p_workspace and email = clean and accepted_at is null and revoked_at is null;
  -- 244 bits de azar fuerte (gen_random_uuid usa pg_strong_random).
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.invitations (workspace_id, email, role, token_hash, invited_by)
    values (p_workspace, clean, p_role, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  insert into public.activity_log (workspace_id, actor_id, action, detail) values (p_workspace, auth.uid(), 'invitacion_creada', clean || ' · ' || p_role::text);
  return token;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.invitations where id = p_invitation;
  if ws is null or not public.has_role(ws, 'admin') then raise exception 'Invitación no disponible.'; end if;
  update public.invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv record; user_email text; confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para aceptar la invitación.'; end if;
  select email, email_confirmed_at into user_email, confirmed from auth.users where id = auth.uid();
  if confirmed is null then raise exception 'Confirma tu correo antes de aceptar invitaciones.'; end if;
  select * into inv from public.invitations where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if inv.id is null then raise exception 'Invitación no válida.'; end if;
  if inv.revoked_at is not null then raise exception 'La invitación fue retirada.'; end if;
  if inv.accepted_at is not null then raise exception 'La invitación ya se utilizó.'; end if;
  if inv.expires_at < now() then raise exception 'La invitación ha caducado.'; end if;
  if lower(user_email) <> inv.email then raise exception 'La invitación es para otra dirección de correo.'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  insert into public.activity_log (workspace_id, actor_id, action, detail) values (inv.workspace_id, auth.uid(), 'invitacion_aceptada', inv.email || ' · ' || inv.role::text);
  return inv.workspace_id;
end $$;

create or replace function public.set_member_role(p_workspace uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.member_role;
begin
  if not public.has_role(p_workspace, 'admin') then raise exception 'Solo administración puede cambiar permisos.'; end if;
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_role is null then raise exception 'Esa persona no pertenece al espacio.'; end if;
  if (v_role = 'owner' or p_role = 'owner') and not public.has_role(p_workspace, 'owner') then raise exception 'Solo la titularidad puede modificar titulares.'; end if;
  if v_role = 'owner' and p_role <> 'owner' and (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'owner') = 1 then
    raise exception 'El espacio necesita al menos una persona titular.';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace and user_id = p_user;
  insert into public.activity_log (workspace_id, actor_id, action, detail) values (p_workspace, auth.uid(), 'permiso_cambiado', p_user::text || ' · ' || p_role::text);
end $$;

create or replace function public.remove_member(p_workspace uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.member_role;
begin
  select role into v_role from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  if v_role is null then raise exception 'Esa persona no pertenece al espacio.'; end if;
  if p_user <> auth.uid() and not public.has_role(p_workspace, 'admin') then raise exception 'Solo administración puede retirar accesos.'; end if;
  if v_role = 'owner' and (select count(*) from public.workspace_members where workspace_id = p_workspace and role = 'owner') = 1 then
    raise exception 'El espacio necesita al menos una persona titular.';
  end if;
  if v_role = 'owner' and p_user <> auth.uid() and not public.has_role(p_workspace, 'owner') then raise exception 'Solo la titularidad puede retirar a otra persona titular.'; end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
  update public.team_roles set user_id = null where workspace_id = p_workspace and user_id = p_user;
  insert into public.activity_log (workspace_id, actor_id, action, detail) values (p_workspace, auth.uid(), 'acceso_retirado', p_user::text);
end $$;

-- Traslado desde la beta local o restauración de una copia: todo o nada.
-- p_mode: 'skip' conserva lo existente y omite duplicados; 'copy' importa duplicados con identificador nuevo.
create or replace function public.import_workspace_backup(p_workspace uuid, p_payload jsonb, p_mode text default 'skip') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb; cid text; inserted_exp int := 0; skipped_exp int := 0; inserted_notes int := 0; inserted_roles int := 0; skipped_other int := 0;
  settings_data jsonb;
begin
  if not public.has_role(p_workspace, 'editor') then raise exception 'Sin permiso para importar en este espacio.'; end if;
  if p_mode not in ('skip', 'copy') then raise exception 'Modo de importación no válido.'; end if;
  if p_payload ->> 'format' is distinct from 'pliego-claro-mvp' then raise exception 'No es una copia de Pliego Claro.'; end if;
  if jsonb_typeof(p_payload -> 'opportunities') <> 'array' then raise exception 'La copia no contiene expedientes.'; end if;
  if octet_length(p_payload::text) > 6 * 1024 * 1024 then raise exception 'La copia supera 6 MB.'; end if;

  for item in select * from jsonb_array_elements(p_payload -> 'opportunities') loop
    cid := item ->> 'id';
    if cid is null or length(cid) = 0 then raise exception 'Expediente sin identificador.'; end if;
    if exists (select 1 from public.expedientes where workspace_id = p_workspace and client_id = cid) then
      if p_mode = 'skip' then skipped_exp := skipped_exp + 1; continue; end if;
      cid := cid || '-copia-' || left(gen_random_uuid()::text, 8);
      item := jsonb_set(item, '{id}', to_jsonb(cid));
      item := jsonb_set(item, '{title}', to_jsonb((item ->> 'title') || ' (copia importada)'));
    end if;
    insert into public.expedientes (workspace_id, client_id, data, created_by, updated_by)
      values (p_workspace, cid, item, auth.uid(), auth.uid());
    inserted_exp := inserted_exp + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'notes', '[]'::jsonb)) loop
    if exists (select 1 from public.notes where workspace_id = p_workspace and client_id = item ->> 'id') then skipped_other := skipped_other + 1; continue; end if;
    insert into public.notes (workspace_id, client_id, expediente_client_id, kind, text, created_at, author_id)
      values (p_workspace, item ->> 'id', coalesce(item ->> 'opportunityId', ''), coalesce(item ->> 'kind', 'Nota'), item ->> 'text',
              coalesce((item ->> 'createdAt')::timestamptz, now()), auth.uid());
    inserted_notes := inserted_notes + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'team', '[]'::jsonb)) loop
    if exists (select 1 from public.team_roles where workspace_id = p_workspace and client_id = item ->> 'id') then skipped_other := skipped_other + 1; continue; end if;
    insert into public.team_roles (workspace_id, client_id, name, role, note)
      values (p_workspace, item ->> 'id', item ->> 'name', item ->> 'role', coalesce(item ->> 'note', ''));
    inserted_roles := inserted_roles + 1;
  end loop;

  if jsonb_typeof(p_payload -> 'settings') = 'object' and coalesce((p_payload ->> 'applySettings')::boolean, false) then
    select data into settings_data from public.workspace_settings where workspace_id = p_workspace for update;
    update public.workspace_settings set data = coalesce(settings_data, '{}'::jsonb) || (p_payload -> 'settings'), version = version + 1
      where workspace_id = p_workspace;
  end if;

  insert into public.activity_log (workspace_id, actor_id, action, detail)
    values (p_workspace, auth.uid(), 'copia_importada', format('%s expedientes, %s notas, %s roles; %s expedientes omitidos', inserted_exp, inserted_notes, inserted_roles, skipped_exp));
  return jsonb_build_object('expedientes', inserted_exp, 'expedientesOmitidos', skipped_exp, 'notas', inserted_notes, 'roles', inserted_roles, 'otrosOmitidos', skipped_other);
end $$;

revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.mark_alert_read(uuid) from public, anon;
revoke all on function public.create_invitation(uuid, text, public.member_role) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.import_workspace_backup(uuid, jsonb, text) from public, anon;
grant execute on function public.create_workspace(text), public.mark_alert_read(uuid), public.create_invitation(uuid, text, public.member_role),
  public.revoke_invitation(uuid), public.accept_invitation(text), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid), public.import_workspace_backup(uuid, jsonb, text) to authenticated;
revoke all on all functions in schema app from public, anon;

-- ---------------------------------------------------------------------------
-- Almacenamiento de originales: carpeta raíz = espacio de trabajo
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'text/plain', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.storage_workspace(object_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then return null;
end $$;
grant execute on function app.storage_workspace(text) to authenticated;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.has_role(app.storage_workspace(name), 'viewer'));
drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_role(app.storage_workspace(name), 'editor'));
-- Sin políticas de update/delete: los originales no se sobrescriben ni se borran desde el navegador.
