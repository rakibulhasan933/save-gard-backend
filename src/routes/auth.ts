import { Router } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { admins } from "../db/schema";
import {
  clearSessionCookie,
  createSessionCookie,
  createSessionToken,
  hashPassword,
  verifyPassword
} from "../lib/auth";
import { emailPasswordSchema } from "../lib/validators";
import { buildCorsHeaders, mergeHeaders, readJsonBody, sendError, sendJson } from "../lib/http";
import { handleHandlerError, wrap } from "./shared";

const router = Router();

router.post("/login", wrap(handleLogin));
router.post("/register", wrap(handleRegister));
router.post("/logout", wrap(handleLogout));

export default router;

async function handleLogin(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);

  try {
    const body = emailPasswordSchema.parse(await readJsonBody(request));
    const [admin] = await db.select().from(admins).where(eq(admins.email, body.email)).limit(1);

    if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
      sendError(response, 401, "Invalid email or password", corsHeaders);
      return;
    }

    const token = await createSessionToken({ adminId: admin.id, email: admin.email });
    const headers = mergeHeaders(corsHeaders, {
      "set-cookie": createSessionCookie(token)
    });
    sendJson(response, 200, { admin: { id: admin.id, email: admin.email } }, headers);
  } catch (error) {
    handleHandlerError(error, response, corsHeaders);
  }
}

async function handleRegister(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);

  try {
    const body = emailPasswordSchema.parse(await readJsonBody(request));
    const existing = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, body.email)).limit(1);

    if (existing.length > 0) {
      sendError(response, 409, "Email is already registered", corsHeaders);
      return;
    }

    const [admin] = await db
      .insert(admins)
      .values({ email: body.email, passwordHash: await hashPassword(body.password) })
      .returning({ id: admins.id, email: admins.email });

    const token = await createSessionToken({ adminId: admin.id, email: admin.email });
    const headers = mergeHeaders(corsHeaders, {
      "set-cookie": createSessionCookie(token)
    });
    sendJson(response, 201, { admin }, headers);
  } catch (error) {
    handleHandlerError(error, response, corsHeaders);
  }
}

function handleLogout(request: IncomingMessage, response: ServerResponse) {
  const corsHeaders = buildCorsHeaders(request);
  const headers = mergeHeaders(corsHeaders, {
    "set-cookie": clearSessionCookie()
  });
  sendJson(response, 200, { ok: true }, headers);
}
