import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { liveScreenSessions } from "../db/schema";
import { notifyLiveScreenRequest } from "../lib/realtime-publisher";
import { buildCorsHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { endLiveScreenSchema, failLiveScreenSchema } from "../lib/validators";
import { getOwnedChild, getOwnedLiveScreenSession } from "../lib/data-access";
import { handleHandlerError, requireAdmin, wrap } from "./shared";

const router = Router();

router.get("/:childId/live-screen", wrap(handleListLiveScreenSessions));
router.post("/:childId/live-screen/request", wrap(handleRequestLiveScreen));
router.patch("/:sessionId/start", wrap(handleMarkLiveScreenActive));
router.patch("/:sessionId/end", wrap(handleEndLiveScreen));
router.patch("/:sessionId/fail", wrap(handleFailLiveScreen));

export default router;

async function handleListLiveScreenSessions(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const admin = await requireAdmin(request, response, corsHeaders);
  if (!admin) return;

  const childId = (request as { params?: { childId?: string } }).params?.childId ?? "";
  const child = await getOwnedChild(childId, admin.id);
  if (!child) {
    sendError(response, 404, "Child not found", corsHeaders);
    return;
  }

  const sessions = await db
    .select()
    .from(liveScreenSessions)
    .where(eq(liveScreenSessions.childId, childId))
    .orderBy(desc(liveScreenSessions.createdAt))
    .limit(25);

  sendJson(response, 200, { sessions }, corsHeaders);
}

async function handleRequestLiveScreen(request: IncomingMessage, response: ServerResponse) {
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

    const [session] = await db
      .insert(liveScreenSessions)
      .values({ childId, adminId: admin.id, status: "requested" })
      .returning();

    await notifyLiveScreenRequest({
      sessionId: session.id,
      childId: child.id,
      adminId: admin.id
    });

    sendJson(response, 201, { session }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleMarkLiveScreenActive(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const sessionId = (request as { params?: { sessionId?: string } }).params?.sessionId ?? "";
    const existing = await getOwnedLiveScreenSession(sessionId, admin.id);
    if (!existing) {
      sendError(response, 404, "Live screen session not found", corsHeaders);
      return;
    }

    const [session] = await db
      .update(liveScreenSessions)
      .set({ status: "active", startedAt: new Date(), reason: null })
      .where(eq(liveScreenSessions.id, sessionId))
      .returning();

    sendJson(response, 200, { session }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleEndLiveScreen(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const sessionId = (request as { params?: { sessionId?: string } }).params?.sessionId ?? "";
    const existing = await getOwnedLiveScreenSession(sessionId, admin.id);
    if (!existing) {
      sendError(response, 404, "Live screen session not found", corsHeaders);
      return;
    }

    const body = endLiveScreenSchema.parse(await readJsonBody(request).catch(() => ({})));
    const [session] = await db
      .update(liveScreenSessions)
      .set({ status: "ended", endedAt: new Date(), reason: body.reason })
      .where(eq(liveScreenSessions.id, sessionId))
      .returning();

    sendJson(response, 200, { session }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}

async function handleFailLiveScreen(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  try {
    const admin = await requireAdmin(request, response, corsHeaders);
    if (!admin) return;

    const sessionId = (request as { params?: { sessionId?: string } }).params?.sessionId ?? "";
    const existing = await getOwnedLiveScreenSession(sessionId, admin.id);
    if (!existing) {
      sendError(response, 404, "Live screen session not found", corsHeaders);
      return;
    }

    const body = failLiveScreenSchema.parse(await readJsonBody(request));
    const [session] = await db
      .update(liveScreenSessions)
      .set({ status: "failed", endedAt: new Date(), reason: body.reason })
      .where(eq(liveScreenSessions.id, sessionId))
      .returning();

    sendJson(response, 200, { session }, corsHeaders);
  } catch (error) {
    handleHandlerError(error, response as ServerResponse, corsHeaders);
  }
}
