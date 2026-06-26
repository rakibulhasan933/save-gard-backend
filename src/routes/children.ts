import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { children } from "../db/schema";
import { createChildSchema, updateChildSchema } from "../lib/validators";
import { buildCorsHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { createUniquePairingCode, handleHandlerError, requireAdmin, wrap } from "./shared";
import { getOwnedChild } from "../lib/data-access";

const router = Router();

router.get("/", wrap(handleListChildren));
router.post("/", wrap(handleCreateChild));
router.get("/:childId", wrap(handleGetChild));
router.patch("/:childId", wrap(handlePatchChild));
router.delete("/:childId", wrap(handleDeleteChild));

export default router;

async function handleListChildren(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const rows = await db.select().from(children).where(eq(children.adminId, admin.id)).orderBy(desc(children.createdAt));
  sendJson(response, 200, { children: rows }, corsHeaders);
}

async function handleCreateChild(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const body = createChildSchema.parse(await readJsonBody(request));
    const [child] = await db
      .insert(children)
      .values({
        adminId: admin.id,
        displayName: body.displayName,
        pairingCode: await createUniquePairingCode()
      })
      .returning();

    sendJson(response, 201, { child }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleGetChild(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
  const child = await getOwnedChild(childId, admin.id);
  if (!child) {
    sendError(response, 404, "Child not found", corsHeaders);
    return;
  }

  sendJson(response, 200, { child }, corsHeaders);
}

async function handlePatchChild(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
    const child = await getOwnedChild(childId, admin.id);
    if (!child) {
      sendError(response, 404, "Child not found", corsHeaders);
      return;
    }

    const body = updateChildSchema.parse(await readJsonBody(request));
    const [updated] = await db
      .update(children)
      .set({
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date()
      })
      .where(eq(children.id, childId))
      .returning();

    sendJson(response, 200, { child: updated }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleDeleteChild(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
  const child = await getOwnedChild(childId, admin.id);
  if (!child) {
    sendError(response, 404, "Child not found", corsHeaders);
    return;
  }

  const [updated] = await db
    .update(children)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(eq(children.id, childId))
    .returning();

  sendJson(response, 200, { child: updated }, corsHeaders);
}
