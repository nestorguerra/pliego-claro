// Borrado de cuenta (derecho de supresión). Elimina los espacios donde la persona es la única
// titular, con sus originales archivados, y después la cuenta. Requiere confirmación escrita.
import { adminClient, handle, HttpError, json, userContext } from "../_shared/common.ts";

Deno.serve(handle(async (req) => {
  const { userId } = await userContext(req);
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== "BORRAR MI CUENTA") throw new HttpError(400, "Escribe BORRAR MI CUENTA para confirmar.");
  const admin = adminClient();
  const { data: owned } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("role", "owner");
  const removed: string[] = [];
  const kept: string[] = [];
  for (const { workspace_id } of owned || []) {
    const { count } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspace_id).eq("role", "owner");
    const { count: members } = await admin.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", workspace_id);
    if ((count || 0) > 1) { kept.push(workspace_id); continue; }
    if ((members || 0) > 1) throw new HttpError(409, "Eres la única persona titular de un espacio compartido. Cede la titularidad o retira a los demás miembros antes de borrar tu cuenta.");
    // Originales del espacio
    const { data: docs } = await admin.from("documents").select("storage_path").eq("workspace_id", workspace_id);
    const paths = (docs || []).map((d: any) => d.storage_path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from("documents").remove(paths.slice(i, i + 100));
      if (error) throw new HttpError(500, "No se pudieron borrar los originales. La cuenta no se ha eliminado.");
    }
    const { error } = await admin.from("workspaces").delete().eq("id", workspace_id);
    if (error) throw new HttpError(500, "No se pudo borrar un espacio. La cuenta no se ha eliminado.");
    removed.push(workspace_id);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, "No se pudo eliminar la cuenta.");
  return json(req, { deleted: true, workspacesRemoved: removed.length, workspacesKept: kept.length });
}));
