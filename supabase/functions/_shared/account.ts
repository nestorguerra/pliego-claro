// Planificación del borrado de cuenta, separada para poder probarla sin servidor.
import { HttpError } from "./errors.ts";

type Plan = { remove: string[]; keep: string[]; blockers: string[] };

// deno-lint-ignore no-explicit-any
export async function planDeletion(admin: any, userId: string): Promise<Plan> {
  const { data: memberships, error } = await admin.from("workspace_members").select("workspace_id, role").eq("user_id", userId);
  if (error) throw new HttpError(500, "No se pudieron comprobar tus espacios. No se ha borrado nada.");
  const plan: Plan = { remove: [], keep: [], blockers: [] };
  for (const { workspace_id, role } of memberships || []) {
    if (role !== "owner") { plan.keep.push(workspace_id); continue; }
    const { data: members } = await admin.from("workspace_members").select("user_id, role").eq("workspace_id", workspace_id);
    const owners = (members || []).filter((m: { role: string }) => m.role === "owner").length;
    if (owners > 1) { plan.keep.push(workspace_id); continue; }
    if ((members || []).length > 1) {
      const { data: ws } = await admin.from("workspaces").select("name").eq("id", workspace_id).single();
      plan.blockers.push(ws?.name || workspace_id);
      continue;
    }
    plan.remove.push(workspace_id);
  }
  return plan;
}
