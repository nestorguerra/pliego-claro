-- H03/H10 · Importación: en modo «copia» los duplicados reciben un identificador nuevo y sus notas y
-- asignaciones de tareas se reasignan a la copia (antes seguían apuntando al expediente original).
-- Devuelve la correspondencia de identificadores para restaurar documentos y comentarios.
create or replace function public.import_workspace_backup(p_workspace uuid, p_payload jsonb, p_mode text default 'skip') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb; old_id text; cid text; plans jsonb; inserted_exp int := 0; skipped_exp int := 0; inserted_notes int := 0; inserted_roles int := 0; skipped_other int := 0;
  settings_data jsonb; mapping jsonb := '{}'::jsonb; note_exp text;
begin
  if not public.has_role(p_workspace, 'editor') then raise exception 'Sin permiso para importar en este espacio.'; end if;
  if p_mode not in ('skip', 'copy') then raise exception 'Modo de importación no válido.'; end if;
  if p_payload ->> 'format' is distinct from 'pliego-claro-mvp' then raise exception 'No es una copia de Pliego Claro.'; end if;
  if jsonb_typeof(p_payload -> 'opportunities') <> 'array' then raise exception 'La copia no contiene expedientes.'; end if;
  if octet_length(p_payload::text) > 12 * 1024 * 1024 then raise exception 'La copia supera 12 MB de datos.'; end if;

  for item in select * from jsonb_array_elements(p_payload -> 'opportunities') loop
    old_id := item ->> 'id';
    cid := old_id;
    if cid is null or length(cid) = 0 then raise exception 'Expediente sin identificador.'; end if;
    if exists (select 1 from public.expedientes where workspace_id = p_workspace and client_id = cid) then
      if p_mode = 'skip' then
        skipped_exp := skipped_exp + 1;
        mapping := mapping || jsonb_build_object(old_id, jsonb_build_object('id', cid, 'imported', false));
        continue;
      end if;
      cid := old_id || '-copia-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
      item := jsonb_set(item, '{id}', to_jsonb(cid));
      item := jsonb_set(item, '{title}', to_jsonb((item ->> 'title') || ' (copia importada)'));
      -- Las claves de asignación contienen el identificador del expediente (next-<id>, requirement-<id>-…).
      if jsonb_typeof(item -> 'taskPlans') = 'object' then
        select coalesce(jsonb_object_agg(replace(key, '-' || old_id, '-' || cid), value), '{}'::jsonb) into plans from jsonb_each(item -> 'taskPlans');
        item := jsonb_set(item, '{taskPlans}', plans);
      end if;
      -- Un expediente copiado no vigila la misma licitación (evita dos expedientes vinculados al mismo aviso).
      item := item - 'official';
    end if;
    insert into public.expedientes (workspace_id, client_id, data, created_by, updated_by)
      values (p_workspace, cid, item, auth.uid(), auth.uid());
    inserted_exp := inserted_exp + 1;
    mapping := mapping || jsonb_build_object(old_id, jsonb_build_object('id', cid, 'imported', true));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'notes', '[]'::jsonb)) loop
    note_exp := coalesce(item ->> 'opportunityId', '');
    if note_exp <> '' and mapping ? note_exp then note_exp := mapping -> note_exp ->> 'id'; end if;
    if exists (select 1 from public.notes where workspace_id = p_workspace and client_id = item ->> 'id') then
      if p_mode = 'skip' then skipped_other := skipped_other + 1; continue; end if;
      item := jsonb_set(item, '{id}', to_jsonb((item ->> 'id') || '-copia-' || left(replace(gen_random_uuid()::text, '-', ''), 8)));
    end if;
    insert into public.notes (workspace_id, client_id, expediente_client_id, kind, text, created_at, author_id)
      values (p_workspace, item ->> 'id', note_exp, coalesce(item ->> 'kind', 'Nota'), item ->> 'text',
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
  return jsonb_build_object('expedientes', inserted_exp, 'expedientesOmitidos', skipped_exp, 'notas', inserted_notes, 'roles', inserted_roles, 'otrosOmitidos', skipped_other, 'mapping', mapping);
end $$;
