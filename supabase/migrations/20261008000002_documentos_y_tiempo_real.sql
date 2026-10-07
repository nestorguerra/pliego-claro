-- Un original archivado no cambia: solo se pueden actualizar metadatos de lectura.
create or replace function app.freeze_document_file() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.storage_path <> old.storage_path or new.sha256 <> old.sha256 or new.size_bytes <> old.size_bytes
     or new.origin <> old.origin or new.expediente_id <> old.expediente_id or new.mime_type <> old.mime_type
     or new.uploaded_by is distinct from old.uploaded_by or new.created_at <> old.created_at then
    raise exception 'El archivo original es inmutable: sube una versión nueva.';
  end if;
  return new;
end $$;
drop trigger if exists documents_freeze_file on public.documents;
create trigger documents_freeze_file before update on public.documents for each row execute function app.freeze_document_file();

-- Las páginas extraídas pertenecen al documento indicado y al mismo espacio.
create or replace function app.check_page_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.workspace_id = new.workspace_id) then
    raise exception 'El documento no pertenece a este espacio.';
  end if;
  return new;
end $$;
drop trigger if exists pages_scope on public.document_pages;
create trigger pages_scope before insert or update on public.document_pages for each row execute function app.check_page_scope();

-- Uso de IA visible para el espacio (sin claves ni contenido).
create or replace function public.ai_usage_summary(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
begin
  if not public.has_role(p_workspace, 'viewer') then raise exception 'Sin permiso.'; end if;
  return jsonb_build_object(
    'globalMonthUsd', (select coalesce(sum(cost_usd), 0) from public.ai_analyses where created_at >= month_start),
    'workspaceMonthUsd', (select coalesce(sum(cost_usd), 0) from public.ai_analyses where workspace_id = p_workspace and created_at >= month_start),
    'workspaceToday', (select count(*) from public.ai_analyses where workspace_id = p_workspace and created_at >= day_start and status <> 'blocked'),
    'userToday', (select count(*) from public.ai_analyses where created_by = auth.uid() and created_at >= day_start and status <> 'blocked'),
    'limits', (select jsonb_object_agg(key, value) from public.app_limits)
  );
end $$;
revoke all on function public.ai_usage_summary(uuid) from public, anon;
grant execute on function public.ai_usage_summary(uuid) to authenticated;

-- Tiempo real para que otra pestaña o persona vea cambios sin recargar (respeta RLS).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.expedientes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.alerts; exception when duplicate_object then null; end;
  end if;
end $$;
