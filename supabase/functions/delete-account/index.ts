// Borrado de cuenta (derecho de supresión). H08: primero se comprueban TODOS los espacios y no se
// borra nada si alguno lo impide. Después se borran los datos (en cascada) y por último los originales;
// un original que no se pueda borrar queda registrado para limpieza, nunca deja datos a medias.
import { adminClient, handle, HttpError, json, userContext } from "../_shared/common.ts";
import { planDeletion } from "../_shared/account.ts";

Deno.serve(handle(async (req) => {
  const { userId } = await userContext(req);
  const { confirm, dryRun } = await req.json().catch(() => ({}));
  const admin = adminClient();
  const plan = await planDeletion(admin, userId);
  if (plan.blockers.length) throw new HttpError(409, `Eres la única persona titular de espacios compartidos (${plan.blockers.join(", ")}). Cede la titularidad o retira a los demás miembros. No se ha borrado nada.`);
  if (dryRun) return json(req, { workspacesToDelete: plan.remove.length, workspacesKept: plan.keep.length });
  if (confirm !== "BORRAR MI CUENTA") throw new HttpError(400, "Escribe BORRAR MI CUENTA para confirmar. No se ha borrado nada.");

  const paths: string[] = [];
  for (const workspaceId of plan.remove) {
    const { data: docs, error } = await admin.from("documents").select("storage_path").eq("workspace_id", workspaceId);
    if (error) throw new HttpError(500, "No se pudieron listar los originales. No se ha borrado nada.");
    paths.push(...(docs || []).map((d: { storage_path: string }) => d.storage_path));
  }
  const { error: deleteError } = await admin.from("workspaces").delete().in("id", plan.remove.length ? plan.remove : ["00000000-0000-0000-0000-000000000000"]);
  if (deleteError) throw new HttpError(500, "No se pudieron borrar los espacios. No se ha borrado nada más.");
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw new HttpError(500, "Los espacios se borraron pero la cuenta no. Vuelve a intentarlo o contacta con administración.");
  let orphaned = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from("documents").remove(paths.slice(i, i + 100));
    if (error) {
      orphaned += Math.min(100, paths.length - i);
      await admin.from("client_errors").insert({ user_id: null, message: "Originales pendientes de borrar tras eliminar una cuenta", context: `${Math.min(100, paths.length - i)} archivos` });
    }
  }
  return json(req, { deleted: true, workspacesRemoved: plan.remove.length, workspacesKept: plan.keep.length, filesPendingCleanup: orphaned });
}));
