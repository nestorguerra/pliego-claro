// Análisis de requisitos con Claude, detrás de sesión, permisos y límites de gasto.
// Solo se envía el texto extraído del documento elegido y el perfil declarado de la empresa.
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { adminClient, handle, HttpError, json, requireRole, userContext } from "../_shared/common.ts";
import { buildUserContent, costUsd, estimateCost, MODEL, OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT, verifyRequirements } from "../_shared/analysis.ts";

const MAX_OUTPUT_TOKENS = 16000;
const PROFILE_FIELDS: Record<string, string> = {
  sectors: "Servicios y sectores", locations: "Zonas de ejecución", technicalSolvency: "Experiencia y solvencia técnica",
  economicSolvency: "Solvencia económica", collaborationNotes: "Medios propios y colaboración", documentsAvailable: "Documentos disponibles",
};

Deno.serve(handle(async (req) => {
  const { db, userId } = await userContext(req);
  const body = await req.json().catch(() => ({}));
  const documentId = String(body.documentId || "");

  // Lectura con la identidad de la persona: RLS impide analizar documentos ajenos.
  const { data: doc } = await db.from("documents").select("id, workspace_id, expediente_id, sha256, name, extraction_status").eq("id", documentId).is("deleted_at", null).maybeSingle();
  if (!doc) throw new HttpError(404, "Documento no disponible.");
  await requireRole(db, doc.workspace_id, "editor");
  if (!["done", "partial"].includes(doc.extraction_status)) throw new HttpError(409, "Primero hay que extraer el texto del documento (o aplicar OCR).");

  const cacheKey = `${doc.sha256}:${PROMPT_VERSION}:${MODEL}`;
  const { data: cached } = await db.from("ai_analyses").select("id, result, created_at, model, cost_usd").eq("workspace_id", doc.workspace_id).eq("cache_key", cacheKey).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (cached && !body.force) return json(req, { analysis: cached, reused: true });

  const { data: pages } = await db.from("document_pages").select("page_number, text").eq("document_id", doc.id).order("page_number");
  if (!pages?.length) throw new HttpError(409, "El documento no tiene texto extraído.");
  const { data: settings } = await db.from("workspace_settings").select("data").eq("workspace_id", doc.workspace_id).maybeSingle();
  const profile = Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, label]) => [label, String(settings?.data?.[key] || "")]));

  // Límites: corte en la aplicación antes de llamar al proveedor.
  const admin = adminClient();
  const { data: limitRows } = await admin.from("app_limits").select("key, value");
  const limits = Object.fromEntries((limitRows || []).map((row: any) => [row.key, Number(row.value)]));
  const content = buildUserContent(pages, profile, limits.ai_max_input_chars || 300000);
  const estimate = estimateCost(content.chars, MAX_OUTPUT_TOKENS);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const [{ data: monthRows }, { count: userToday }, { count: wsToday }] = await Promise.all([
    admin.from("ai_analyses").select("cost_usd").gte("created_at", monthStart.toISOString()),
    admin.from("ai_analyses").select("id", { count: "exact", head: true }).eq("created_by", userId).neq("status", "blocked").gte("created_at", dayStart.toISOString()),
    admin.from("ai_analyses").select("id", { count: "exact", head: true }).eq("workspace_id", doc.workspace_id).neq("status", "blocked").gte("created_at", dayStart.toISOString()),
  ]);
  const monthSpent = (monthRows || []).reduce((sum: number, row: any) => sum + Number(row.cost_usd || 0), 0);
  let blocked = "";
  if (!Deno.env.get("ANTHROPIC_API_KEY")) blocked = "La IA no está activada en este servidor. Puedes seguir con la revisión manual.";
  else if (monthSpent + estimate > (limits.ai_monthly_budget_usd ?? 0)) blocked = `Se ha alcanzado el presupuesto mensual de IA (${monthSpent.toFixed(2)} de ${limits.ai_monthly_budget_usd} USD). La revisión manual sigue disponible.`;
  else if ((userToday || 0) >= (limits.ai_user_daily_requests ?? 0)) blocked = "Has alcanzado tus análisis de hoy. La revisión manual sigue disponible.";
  else if ((wsToday || 0) >= (limits.ai_workspace_daily_requests ?? 0)) blocked = "Este espacio ha alcanzado sus análisis de hoy.";
  const base = { workspace_id: doc.workspace_id, expediente_id: doc.expediente_id, document_id: doc.id, cache_key: cacheKey, model: MODEL, prompt_version: PROMPT_VERSION, created_by: userId };
  if (blocked) {
    await admin.from("ai_analyses").insert({ ...base, status: "blocked", error: blocked });
    throw new HttpError(429, blocked);
  }

  const { data: running } = await admin.from("ai_analyses").insert({ ...base, status: "running", cost_usd: estimate }).select("id").single();
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, maxRetries: 1, timeout: 140_000 });
  try {
    // Fallback del servidor ante rechazos por clasificadores; formato JSON garantizado por esquema.
    const stream = (client.beta.messages as any).stream({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: content.text }],
    });
    const message = await stream.finalMessage();
    const usage = message.usage || {};
    const cost = costUsd(Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0) + Number(usage.cache_read_input_tokens || 0), Number(usage.output_tokens || 0));
    if (message.stop_reason === "refusal") {
      await admin.from("ai_analyses").update({ status: "refused", input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cost_usd: cost, error: "El modelo rechazó la solicitud." }).eq("id", running!.id);
      throw new HttpError(422, "El modelo no ha analizado este documento. Continúa con la revisión manual.");
    }
    if (message.stop_reason === "max_tokens") {
      await admin.from("ai_analyses").update({ status: "failed", input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cost_usd: cost, error: "Respuesta incompleta (límite de salida)." }).eq("id", running!.id);
      throw new HttpError(502, "La respuesta quedó incompleta y no se ha usado. Prueba con un documento más corto o sigue manualmente.");
    }
    const textBlock = (message.content || []).find((block: any) => block.type === "text");
    let parsed: any;
    try { parsed = JSON.parse(textBlock?.text || ""); } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.requirements)) {
      await admin.from("ai_analyses").update({ status: "failed", input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cost_usd: cost, error: "Formato no válido." }).eq("id", running!.id);
      throw new HttpError(502, "La respuesta no tenía el formato esperado y no se ha usado.");
    }
    const verified = verifyRequirements(parsed, pages);
    verified.coverage = { includedPages: content.includedPages.length, totalPages: content.totalPages, lastPage: content.includedPages.at(-1) ?? null };
    if (content.includedPages.length < content.totalPages) verified.warnings = [...(verified.warnings || []), `Solo se analizaron las páginas 1–${content.includedPages.at(-1)} de ${content.totalPages} por el límite de tamaño. Revisa el resto manualmente.`];
    verified.servedBy = message.model || MODEL;
    const { data: saved } = await admin.from("ai_analyses").update({ status: "done", input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cost_usd: cost, result: verified, model: message.model || MODEL }).eq("id", running!.id).select("id, result, created_at, model, cost_usd").single();
    return json(req, { analysis: saved, reused: false });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const status = (error as any)?.status;
    // Sin respuesta útil: se registra el fallo con la estimación como coste máximo posible; no hay reintentos ilimitados.
    await admin.from("ai_analyses").update({ status: "failed", error: `Proveedor: ${status || "sin respuesta"}` }).eq("id", running!.id);
    if (status === 429 || status === 529) throw new HttpError(503, "El proveedor de IA está saturado o ha alcanzado su límite. Inténtalo más tarde; la revisión manual sigue disponible.");
    throw new HttpError(502, "El análisis no se ha completado. No se ha generado ningún resultado; sigue con la revisión manual.");
  }
}));
