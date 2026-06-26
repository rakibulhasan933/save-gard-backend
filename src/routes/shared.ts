import type { IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "../db";
import { children } from "../db/schema";
import { buildCorsHeaders, sendError, sendJson } from "../lib/http";
import { getCurrentAdminFromHeaders } from "../lib/auth";

export type CorsHeaders = ReturnType<typeof buildCorsHeaders>;
export type ApiHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void> | void;

export function wrap(handler: ApiHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request as IncomingMessage, response as ServerResponse)).catch(next);
  };
}

export async function requireAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  corsHeaders: CorsHeaders
) {
  const admin = await getCurrentAdminFromHeaders(request.headers);
  if (!admin) {
    sendError(response, 401, "Unauthorized", corsHeaders);
    return null;
  }

  return admin;
}

export function handleHandlerError(error: unknown, response: ServerResponse, corsHeaders: CorsHeaders) {
  if (error instanceof ZodError) {
    sendJson(response, 400, { error: "Invalid request body", issues: error.flatten() }, corsHeaders);
    return;
  }

  if (error instanceof Error && error.message === "Invalid JSON body") {
    sendError(response, 400, "Invalid JSON body", corsHeaders);
    return;
  }

  console.error(error);
  sendError(response, 500, "Internal server error", corsHeaders);
}

export async function createUniquePairingCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generatePairingCode();
    const existing = await db.select({ id: children.id }).from(children).where(eq(children.pairingCode, code)).limit(1);
    if (existing.length === 0) return code;
  }

  throw new Error("Could not generate unique pairing code");
}

export function generatePairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function corsHeadersFor(request: IncomingMessage) {
  return buildCorsHeaders(request);
}
