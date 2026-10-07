// Utilidades comunes de las funciones de servidor. Nunca registran claves ni contenido de documentos.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((v) => v.trim()).filter(Boolean);

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin) ? origin || "*" : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function firstKey(name: string, legacy: string): string {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      return keys.default || Object.values(keys)[0];
    } catch { /* formato inesperado: probar la variable antigua */ }
  }
  const value = Deno.env.get(legacy);
  if (!value) throw new HttpError(500, "Servidor sin configurar.");
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, firstKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Cliente con la identidad de quien llama: todas sus consultas pasan por RLS. */
export async function userContext(req: Request): Promise<{ db: SupabaseClient; userId: string; email: string }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sesión requerida.");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, firstKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Tu sesión ha caducado. Vuelve a entrar.");
  return { db, userId: data.user.id, email: data.user.email || "" };
}

export async function requireRole(db: SupabaseClient, workspaceId: string, role: "viewer" | "editor" | "admin" | "owner") {
  const { data, error } = await db.rpc("has_role", { ws: workspaceId, min_role: role });
  if (error || data !== true) throw new HttpError(403, "No tienes permiso para esta acción en este espacio.");
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Método no permitido." }, 405);
    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
      console.error("fallo interno", error instanceof Error ? error.name : "desconocido");
      return json(req, { error: "Error interno. No se ha completado la operación." }, 500);
    }
  };
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) throw new HttpError(503, "El correo no está configurado en el servidor.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new HttpError(502, `El proveedor de correo rechazó el envío (${response.status}).`);
  const body = await response.json();
  return String(body.id || "");
}
