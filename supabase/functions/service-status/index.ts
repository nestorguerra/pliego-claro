// Estado de los servicios para la interfaz y la comprobación de entrega. No revela valores secretos.
import { adminClient, handle, json, userContext } from "../_shared/common.ts";

Deno.serve(handle(async (req) => {
  await userContext(req);
  const admin = adminClient();
  const { data: limits } = await admin.from("app_limits").select("key, value");
  const enabled = Number((limits || []).find((row: { key: string }) => row.key === "ai_enabled")?.value ?? 0) === 1;
  return json(req, {
    ai: Boolean(Deno.env.get("ANTHROPIC_API_KEY")) && enabled,
    aiConfigured: Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
    email: Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("MAIL_FROM")),
    siteUrl: Deno.env.get("SITE_URL") || "",
  });
}));
