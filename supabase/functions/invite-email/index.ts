// Envía por correo una invitación ya creada por administración. No es un reenvío abierto:
// solo la persona que creó la invitación, aún pendiente, puede enviarla a su destinatario.
import { adminClient, handle, HttpError, json, sendEmail, userContext } from "../_shared/common.ts";

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(handle(async (req) => {
  const { db, userId } = await userContext(req);
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, "Invitación no válida.");
  const admin = adminClient();
  const { data: invitation } = await admin.from("invitations").select("id, workspace_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at").eq("token_hash", await sha256(token)).maybeSingle();
  if (!invitation || invitation.invited_by !== userId) throw new HttpError(404, "Invitación no disponible.");
  if (invitation.accepted_at || invitation.revoked_at || new Date(invitation.expires_at) < new Date()) throw new HttpError(410, "La invitación ya no está pendiente.");
  const { data: allowed } = await db.rpc("has_role", { ws: invitation.workspace_id, min_role: "admin" });
  if (allowed !== true) throw new HttpError(403, "Solo administración puede invitar.");
  const { data: workspace } = await admin.from("workspaces").select("name").eq("id", invitation.workspace_id).single();
  const { data: inviter } = await admin.from("profiles").select("display_name").eq("user_id", userId).single();
  const site = Deno.env.get("SITE_URL") || "";
  const roles: Record<string, string> = { viewer: "lectura", editor: "edición", admin: "administración" };
  const link = `${site}#invitacion=${token}`;
  const id = await sendEmail(invitation.email, `Invitación a «${workspace?.name}» en Pliego Claro`,
    `${inviter?.display_name || "Una persona"} te invita al espacio «${workspace?.name}» con permiso de ${roles[invitation.role] || invitation.role}.\n\n` +
    `Para aceptarla, entra o crea una cuenta con esta dirección (${invitation.email}) y abre:\n${link}\n\nCaduca el ${new Date(invitation.expires_at).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}. Si no la esperabas, ignora este mensaje.`);
  return json(req, { sent: true, providerId: id });
}));
