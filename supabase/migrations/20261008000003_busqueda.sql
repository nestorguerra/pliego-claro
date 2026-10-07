-- Búsqueda reproducible sobre licitaciones oficiales importadas (orden estable, sin puntuación opaca).
create or replace function public.search_tenders(
  p_q text default null, p_cpv text default null, p_province text default null,
  p_min numeric default null, p_max numeric default null,
  p_from date default null, p_to date default null,
  p_status text default 'vigentes', p_limit int default 30, p_offset int default 0
) returns setof public.tenders
language sql stable security invoker set search_path = '' as $$
  select t.* from public.tenders t
  where t.deleted_at is null
    and (coalesce(trim(p_q), '') = '' or t.search @@ websearch_to_tsquery('spanish', p_q)
         or t.folder_id ilike '%' || trim(p_q) || '%')
    and (coalesce(trim(p_cpv), '') = '' or exists (
         select 1 from unnest(t.cpv) c, unnest(string_to_array(regexp_replace(p_cpv, '[^0-9,]', '', 'g'), ',')) wanted
         where wanted <> '' and c like wanted || '%'))
    and (coalesce(trim(p_province), '') = '' or t.province ilike '%' || trim(p_province) || '%' or t.buyer_city ilike '%' || trim(p_province) || '%')
    and (p_min is null or coalesce(t.amount_without_tax, t.amount_with_tax) >= p_min)
    and (p_max is null or coalesce(t.amount_without_tax, t.amount_with_tax) <= p_max)
    and (p_from is null or (t.deadline_at at time zone 'Europe/Madrid')::date >= p_from)
    and (p_to is null or (t.deadline_at at time zone 'Europe/Madrid')::date <= p_to)
    and (case coalesce(p_status, 'vigentes')
           when 'vigentes' then t.status_code = 'PUB' and t.deadline_at >= now()
           when 'todas' then true
           else t.status_code = p_status end)
  order by t.deadline_at asc nulls last, t.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
revoke all on function public.search_tenders(text, text, text, numeric, numeric, date, date, text, int, int) from public, anon;
grant execute on function public.search_tenders(text, text, text, numeric, numeric, date, date, text, int, int) to authenticated;

create or replace function public.tender_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.tenders where deleted_at is null),
    'vigentes', (select count(*) from public.tenders where deleted_at is null and status_code = 'PUB' and deadline_at >= now()),
    'lastRun', (select to_jsonb(r) from (select started_at, finished_at, status, pages, entries, upserts, changes, error from public.sync_runs order by id desc limit 1) r),
    'lastOk', (select max(finished_at) from public.sync_runs where status = 'ok')
  )
$$;
grant execute on function public.tender_stats() to authenticated;
