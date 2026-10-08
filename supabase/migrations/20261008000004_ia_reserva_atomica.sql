-- H05/H06 · IA: caché por versión del texto y del perfil, y reserva de gasto atómica.
alter table public.ai_analyses add column if not exists request_id text;
alter table public.ai_analyses add column if not exists text_hash text;
alter table public.ai_analyses add column if not exists profile_hash text;
alter table public.ai_analyses add column if not exists estimate_usd numeric(10, 4) not null default 0;
alter table public.ai_analyses add column if not exists finished_at timestamptz;
create unique index if not exists ai_request_unique on public.ai_analyses (request_id) where request_id is not null;

insert into public.app_limits (key, value, note) values
  ('ai_enabled', 1, 'Interruptor operativo: 0 detiene cualquier análisis nuevo de inmediato.'),
  ('ai_max_cost_per_analysis_usd', 1, 'Coste máximo estimado de un análisis; si se supera, no se llama al proveedor.')
on conflict (key) do nothing;
update public.app_limits set value = 15, note = 'Presupuesto mensual autorizado por Néstor Guerra (8 oct 2026). Corte de la aplicación.' where key = 'ai_monthly_budget_usd';

-- Una sola transacción decide si se puede gastar, con un cerrojo global: dos solicitudes
-- simultáneas no pueden superar el presupuesto ni lanzar dos veces el mismo análisis.
create or replace function public.ai_reserve(
  p_workspace uuid, p_expediente uuid, p_document uuid, p_user uuid, p_cache_key text,
  p_model text, p_prompt_version text, p_estimate numeric, p_request_id text,
  p_text_hash text, p_profile_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  limits jsonb;
  month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  day_start timestamptz := date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  spent numeric; user_count int; ws_count int; existing record; new_id uuid; reason text;
begin
  perform pg_advisory_xact_lock(hashtext('pliego-claro-ai-budget'));

  -- Ejecuciones colgadas: se cierran como fallo y conservan su coste estimado (máximo posible).
  update public.ai_analyses set status = 'failed', error = 'Tiempo agotado sin respuesta del proveedor.', finished_at = now()
    where status = 'running' and created_at < now() - interval '10 minutes';

  if p_request_id is not null then
    select id, status into existing from public.ai_analyses where request_id = p_request_id;
    if existing.id is not null then return jsonb_build_object('status', 'duplicate', 'id', existing.id, 'analysisStatus', existing.status); end if;
  end if;
  select id into existing from public.ai_analyses where workspace_id = p_workspace and cache_key = p_cache_key and status = 'running' limit 1;
  if existing.id is not null then return jsonb_build_object('status', 'running', 'id', existing.id); end if;

  select jsonb_object_agg(key, value) into limits from public.app_limits;
  select coalesce(sum(cost_usd), 0) into spent from public.ai_analyses where created_at >= month_start and status <> 'blocked';
  select count(*) into user_count from public.ai_analyses where created_by = p_user and created_at >= day_start and status not in ('blocked');
  select count(*) into ws_count from public.ai_analyses where workspace_id = p_workspace and created_at >= day_start and status not in ('blocked');

  if coalesce((limits ->> 'ai_enabled')::numeric, 0) = 0 then reason := 'La IA está desactivada por administración. La revisión manual sigue disponible.';
  elsif p_estimate > coalesce((limits ->> 'ai_max_cost_per_analysis_usd')::numeric, 0) then reason := format('El documento es demasiado largo para el límite por análisis (%s USD estimados).', round(p_estimate, 2));
  elsif spent + p_estimate > coalesce((limits ->> 'ai_monthly_budget_usd')::numeric, 0) then reason := format('Se ha alcanzado el presupuesto mensual de IA (%s de %s USD). La revisión manual sigue disponible.', round(spent, 2), limits ->> 'ai_monthly_budget_usd');
  elsif user_count >= coalesce((limits ->> 'ai_user_daily_requests')::int, 0) then reason := 'Has alcanzado tus análisis de hoy. La revisión manual sigue disponible.';
  elsif ws_count >= coalesce((limits ->> 'ai_workspace_daily_requests')::int, 0) then reason := 'Este espacio ha alcanzado sus análisis de hoy.';
  end if;

  if reason is not null then
    insert into public.ai_analyses (workspace_id, expediente_id, document_id, cache_key, model, prompt_version, status, error, created_by, request_id, text_hash, profile_hash)
      values (p_workspace, p_expediente, p_document, p_cache_key, p_model, p_prompt_version, 'blocked', reason, p_user, p_request_id, p_text_hash, p_profile_hash)
      returning id into new_id;
    return jsonb_build_object('status', 'blocked', 'id', new_id, 'reason', reason);
  end if;

  insert into public.ai_analyses (workspace_id, expediente_id, document_id, cache_key, model, prompt_version, status, cost_usd, estimate_usd, created_by, request_id, text_hash, profile_hash)
    values (p_workspace, p_expediente, p_document, p_cache_key, p_model, p_prompt_version, 'running', p_estimate, p_estimate, p_user, p_request_id, p_text_hash, p_profile_hash)
    returning id into new_id;
  return jsonb_build_object('status', 'reserved', 'id', new_id);
end $$;
revoke all on function public.ai_reserve(uuid, uuid, uuid, uuid, text, text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_reserve(uuid, uuid, uuid, uuid, text, text, text, numeric, text, text, text) to service_role;
