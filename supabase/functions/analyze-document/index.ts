// Análisis de requisitos con Claude, detrás de sesión, permisos y una reserva de gasto atómica.
// Solo se envía el texto extraído del documento elegido y el perfil declarado de la empresa.
// La llamada al proveedor sigue en segundo plano: recargar la página no repite el cobro.
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { adminClient, handle, HttpError, json, requireRole, userContext } from "../_shared/common.ts";
import { actualCost, buildUserContent, cacheKeyFor, estimateCost, MODEL, OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT, verifyRequirements } from "../_shared/analysis.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const MAX_OUTPUT_TOKENS = 16000;
const PROFILE_FIELDS: Record<string, string> = {
  sectors: "Servicios y sectores", locations: "Zonas de ejecución", technicalSolvency: "Experiencia y solvencia técnica",
  economicSolvency: "Solvencia económica", collaborationNotes: "Medios propios y colaboración", documentsAvailable: "Documentos disponibles",
};

type Pages = { page_number: number; text: string }[];

async function runAnalysis(analysisId: string, pages: Pages, content: { text: string; includedPages: number[]; totalPages: number }) {
  const admin = adminClient();
  const finish = (fields: Record<string, unknown>) => admin.from("ai_analyses").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", analysisId);
  // Sin reintentos automáticos del SDK: un reintento tras una respuesta parcial podría cobrarse dos veces.
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")!, maxRetries: 0, timeout: 140_000 });
  try {
    // deno-lint-ignore no-explicit-any
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
    const served = String(message.model || MODEL);
    const cost = actualCost(usage, served);
    const tokens = { input_tokens: Number(usage.input_tokens || 0), output_tokens: Number(usage.output_tokens || 0), cost_usd: cost, model: served };
    if (message.stop_reason === "refusal") return await finish({ ...tokens, status: "refused", error: "El modelo no ha analizado este documento. Continúa con la revisión manual." });
    if (message.stop_reason === "max_tokens") return await finish({ ...tokens, status: "failed", error: "La respuesta quedó incompleta y no se ha usado." });
    // deno-lint-ignore no-explicit-any
    const textBlock = (message.content || []).find((block: any) => block.type === "text");
    // deno-lint-ignore no-explicit-any
    let parsed: any = null;
    try { parsed = JSON.parse(textBlock?.text || ""); } catch { parsed = null; }
    if (!parsed || !Array.isArray(parsed.requirements)) return await finish({ ...tokens, status: "failed", error: "La respuesta no tenía el formato esperado y no se ha usado." });
    const verified = verifyRequirements(parsed, pages);
    verified.coverage = { includedPages: content.includedPages.length, totalPages: content.totalPages, lastPage: content.includedPages.at(-1) ?? null };
    if (content.includedPages.length < content.totalPages) verified.warnings = [...(verified.warnings || []), `Solo se analizaron las páginas 1–${content.includedPages.at(-1)} de ${content.totalPages} por el límite de tamaño. Revisa el resto manualmente.`];
    verified.servedBy = served;
    await finish({ ...tokens, status: "done", result: verified, error: null });
  } catch (error) {
    // deno-lint-ignore no-explicit-any
    const status = (error as any)?.status;
    // Se conserva la estimación como coste (máximo posible): no se sabe cuánto facturó el proveedor.
    await finish({ status: "failed", error: status === 429 || status === 529 ? "El proveedor de IA está saturado o ha alcanzado su límite. Inténtalo más tarde." : `El análisis no se completó (proveedor: ${status || "sin respuesta"}).` });
  }
}

Deno.serve(handle(async (req) => {
  const { db, userId } = await userContext(req);
  const body = await req.json().catch(() => ({}));
  const documentId = String(body.documentId || "");
  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/.test(body.requestId) ? body.requestId : null;

  // Lectura con la identidad de la persona: RLS impide analizar documentos ajenos.
  const { data: doc } = await db.from("documents").select("id, workspace_id, expediente_id, sha256, name, extraction_status").eq("id", documentId).is("deleted_at", null).maybeSingle();
  if (!doc) throw new HttpError(404, "Documento no disponible.");
  await requireRole(db, doc.workspace_id, "editor");
  if (!["done", "partial"].includes(doc.extraction_status)) throw new HttpError(409, "Primero hay que extraer el texto del documento (o aplicar OCR).");
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(503, "La IA no está activada en este servidor. Puedes seguir con la revisión manual.");

  const { data: pages } = await db.from("document_pages").select("page_number, text").eq("document_id", doc.id).order("page_number");
  if (!pages?.length) throw new HttpError(409, "El documento no tiene texto extraído.");
  const { data: settings } = await db.from("workspace_settings").select("data").eq("workspace_id", doc.workspace_id).maybeSingle();
  const profile = Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key, label]) => [label, String(settings?.data?.[key] || "")]));
  const { cacheKey, textHash, profileHash } = await cacheKeyFor(doc.sha256, pages, profile);

  const { data: cached } = await db.from("ai_analyses").select("id, status, result, created_at, model, cost_usd").eq("workspace_id", doc.workspace_id).eq("cache_key", cacheKey).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (cached && !body.force) return json(req, { analysis: cached, reused: true });

  const admin = adminClient();
  const { data: limitRows } = await admin.from("app_limits").select("key, value");
  const limits = Object.fromEntries((limitRows || []).map((row: { key: string; value: number }) => [row.key, Number(row.value)]));
  const content = buildUserContent(pages, profile, limits.ai_max_input_chars || 300000);
  const estimate = estimateCost(content.chars, MAX_OUTPUT_TOKENS);

  const { data: reservation, error } = await admin.rpc("ai_reserve", {
    p_workspace: doc.workspace_id, p_expediente: doc.expediente_id, p_document: doc.id, p_user: userId, p_cache_key: cacheKey,
    p_model: MODEL, p_prompt_version: PROMPT_VERSION, p_estimate: estimate, p_request_id: requestId, p_text_hash: textHash, p_profile_hash: profileHash,
  });
  if (error || !reservation) throw new HttpError(500, "No se pudo reservar el análisis.");
  if (reservation.status === "blocked") throw new HttpError(429, reservation.reason);
  if (reservation.status !== "reserved") return json(req, { analysisId: reservation.id, status: "running", reused: false, duplicate: true }, 202);

  const work = runAnalysis(reservation.id, pages, content);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work); else await work;
  return json(req, { analysisId: reservation.id, status: "running", estimateUsd: estimate, reused: false }, 202);
}));
