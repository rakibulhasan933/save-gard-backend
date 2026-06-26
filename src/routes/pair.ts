import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { childDevices, children } from "../db/schema";
import { issueChildToken } from "../lib/childToken";
import { buildCorsHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { wrap } from "./shared";

const router = Router();

router.post("/pair", wrap(handlePairChild));

export default router;

async function handlePairChild(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const bodySchema = z.object({
    pairingCode: z.string().trim().min(1),
    deviceUuid: z.string().trim().min(1).optional(),
    platform: z.enum(["android", "ios", "web"]).optional(),
    osVersion: z.string().trim().min(1).max(80).optional(),
    appVersion: z.string().trim().min(1).max(80).optional()
  });
  const parsed = bodySchema.safeParse(await readJsonBody(request).catch(() => null));

  if (!parsed.success) {
    sendError(response, 400, "Invalid body", corsHeaders);
    return;
  }

  const body = parsed.data;
  const pairingCode = body.pairingCode.toUpperCase();
  const deviceUuid = body.deviceUuid ?? randomUUID();

  const [child] = await db
    .select()
    .from(children)
    .where(and(eq(children.pairingCode, pairingCode), ne(children.status, "disabled")))
    .limit(1);

  if (!child) {
    sendError(response, 404, "Invalid pairing code", corsHeaders);
    return;
  }

  if (child.status === "unpaired") {
    await db.update(children).set({ status: "paired", updatedAt: new Date() }).where(eq(children.id, child.id));
  }

  await db
    .insert(childDevices)
    .values({
      childId: child.id,
      deviceUuid,
      platform: body.platform ?? "android",
      osVersion: body.osVersion ?? "unknown",
      appVersion: body.appVersion ?? "unknown",
      isActive: true,
      lastOnlineAt: new Date()
    })
    .onConflictDoUpdate({
      target: childDevices.deviceUuid,
      set: {
        childId: child.id,
        platform: body.platform ?? "android",
        osVersion: body.osVersion ?? "unknown",
        appVersion: body.appVersion ?? "unknown",
        isActive: true,
        lastOnlineAt: new Date(),
        updatedAt: new Date()
      }
    });

  const childToken = await issueChildToken(child.id);
  sendJson(response, 201, { childId: child.id, childToken, deviceUuid }, corsHeaders);
}
