import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { appBlockRules } from "../db/schema";
import { createAppRuleSchema, updateAppRuleSchema } from "../lib/validators";
import { buildCorsHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { getOwnedAppRule, getOwnedChild } from "../lib/data-access";
import { handleHandlerError, requireAdmin, wrap } from "./shared";

const router = Router();

router.get("/:childId/app-rules", wrap(handleListAppRules));
router.post("/:childId/app-rules", wrap(handleCreateAppRule));
router.patch("/:ruleId", wrap(handlePatchAppRule));
router.delete("/:ruleId", wrap(handleDeleteAppRule));

export default router;

async function handleListAppRules(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
  const child = await getOwnedChild(childId, admin.id);
  if (!child) {
    sendError(response, 404, "Child not found", corsHeaders);
    return;
  }

  const rules = await db.select().from(appBlockRules).where(eq(appBlockRules.childId, childId)).orderBy(desc(appBlockRules.createdAt));
  sendJson(response, 200, { rules }, corsHeaders);
}

async function handleCreateAppRule(request: IncomingMessage, response: ServerResponse) {
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

    const body = createAppRuleSchema.parse(await readJsonBody(request));
    const [rule] = await db
      .insert(appBlockRules)
      .values({
        childId,
        packageName: body.packageName,
        label: body.label,
        isEnabled: body.isEnabled
      })
      .returning();

    sendJson(response, 201, { rule }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handlePatchAppRule(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const ruleId = (request as { params?: { ruleId?: string } }).params?.ruleId ?? "";
    const existing = await getOwnedAppRule(ruleId, admin.id);
    if (!existing) {
      sendError(response, 404, "App rule not found", corsHeaders);
      return;
    }

    const body = updateAppRuleSchema.parse(await readJsonBody(request));
    const [rule] = await db
      .update(appBlockRules)
      .set({
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {})
      })
      .where(eq(appBlockRules.id, ruleId))
      .returning();

    sendJson(response, 200, { rule }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleDeleteAppRule(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const ruleId = (request as { params?: { ruleId?: string } }).params?.ruleId ?? "";
  const existing = await getOwnedAppRule(ruleId, admin.id);
  if (!existing) {
    sendError(response, 404, "App rule not found", corsHeaders);
    return;
  }

  await db.delete(appBlockRules).where(eq(appBlockRules.id, ruleId));
  sendJson(response, 200, { ok: true }, corsHeaders);
}

