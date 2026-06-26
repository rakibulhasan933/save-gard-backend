import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

export type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  path?: string;
  maxAge?: number;
};

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string | number | string[]> = {}
) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(payload);
}

export function sendNoContent(response: ServerResponse, statusCode = 204, headers: Record<string, string | number | string[]> = {}) {
  response.writeHead(statusCode, headers);
  response.end();
}

export function sendError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  headers: Record<string, string | number | string[]> = {}
) {
  sendJson(response, statusCode, { error: message }, headers);
}

export async function readJsonBody<T = unknown>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const path = options.path ?? "/";

  parts.push(`Path=${path}`);
  parts.push(`SameSite=${capitalizeSameSite(options.sameSite ?? "lax")}`);
  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }

  if (options.secure ?? process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  return parts.join("; ");
}

export function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin) return {};

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    vary: "Origin"
  };
}

export function mergeHeaders(
  ...headerSets: Array<Record<string, string | number | string[]> | undefined>
) {
  return Object.assign({}, ...headerSets);
}

function capitalizeSameSite(value: "lax" | "strict" | "none") {
  return value[0].toUpperCase() + value.slice(1);
}

export function getHeader(header: IncomingHttpHeaders, name: string) {
  const value = header[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
