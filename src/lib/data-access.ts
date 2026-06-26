import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { appBlockRules, children, liveScreenSessions, webFilterRules } from "../db/schema";

export async function getOwnedChild(childId: string, adminId: string) {
  const [child] = await db
    .select()
    .from(children)
    .where(and(eq(children.id, childId), eq(children.adminId, adminId)))
    .limit(1);

  return child ?? null;
}

export async function getOwnedAppRule(ruleId: string, adminId: string) {
  const [rule] = await db
    .select({ rule: appBlockRules })
    .from(appBlockRules)
    .innerJoin(children, eq(appBlockRules.childId, children.id))
    .where(and(eq(appBlockRules.id, ruleId), eq(children.adminId, adminId)))
    .limit(1);

  return rule?.rule ?? null;
}

export async function getOwnedWebRule(ruleId: string, adminId: string) {
  const [rule] = await db
    .select({ rule: webFilterRules })
    .from(webFilterRules)
    .innerJoin(children, eq(webFilterRules.childId, children.id))
    .where(and(eq(webFilterRules.id, ruleId), eq(children.adminId, adminId)))
    .limit(1);

  return rule?.rule ?? null;
}

export async function getOwnedLiveScreenSession(sessionId: string, adminId: string) {
  const [session] = await db
    .select()
    .from(liveScreenSessions)
    .where(and(eq(liveScreenSessions.id, sessionId), eq(liveScreenSessions.adminId, adminId)))
    .limit(1);

  return session ?? null;
}
