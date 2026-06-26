import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { webFilterRules } from "../db/schema";
import { createWebRuleSchema, updateWebRuleSchema } from "../lib/validators";
import { buildCorsHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { getOwnedChild, getOwnedWebRule } from "../lib/data-access";
import { handleHandlerError, requireAdmin, wrap } from "./shared";

const router = Router();

router.get("/:childId/web-rules", wrap(handleListWebRules));
router.post("/:childId/web-rules", wrap(handleCreateWebRule));
router.patch("/:ruleId", wrap(handlePatchWebRule));
router.delete("/:ruleId", wrap(handleDeleteWebRule));

export default router;

async function handleListWebRules(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
  const child = await getOwnedChild(childId, admin.id);
  if (!child) {
    sendError(response, 404, "Child not found", corsHeaders);
    return;
  }

  const rules = await db.select().from(webFilterRules).where(eq(webFilterRules.childId, childId)).orderBy(desc(webFilterRules.createdAt));
  sendJson(response, 200, { rules }, corsHeaders);
}

async function handleCreateWebRule(request: IncomingMessage, response: ServerResponse) {
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

    const body = createWebRuleSchema.parse(await readJsonBody(request));
    const [rule] = await db
      .insert(webFilterRules)
      .values({
        childId,
        domain: body.domain,
        category: body.category,
        isBlocked: body.isBlocked
      })
      .returning();

    sendJson(response, 201, { rule }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handlePatchWebRule(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const ruleId = (request as { params?: { ruleId?: string } }).params?.ruleId ?? "";
    const existing = await getOwnedWebRule(ruleId, admin.id);
    if (!existing) {
      sendError(response, 404, "Web rule not found", corsHeaders);
      return;
    }

    const body = updateWebRuleSchema.parse(await readJsonBody(request));
    const [rule] = await db
      .update(webFilterRules)
      .set({
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.isBlocked !== undefined ? { isBlocked: body.isBlocked } : {})
      })
      .where(eq(webFilterRules.id, ruleId))
      .returning();

    sendJson(response, 200, { rule }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleDeleteWebRule(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const ruleId = (request as { params?: { ruleId?: string } }).params?.ruleId ?? "";
  const existing = await getOwnedWebRule(ruleId, admin.id);
  if (!existing) {
    sendError(response, 404, "Web rule not found", corsHeaders);
    return;
  }

  await db.delete(webFilterRules).where(eq(webFilterRules.id, ruleId));
  sendJson(response, 200, { ok: true }, corsHeaders);
}

