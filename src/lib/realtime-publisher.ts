import { sql } from "drizzle-orm";
import { db } from "../db";

export type LiveScreenRequestNotice = {
  sessionId: string;
  childId: string;
  adminId: string;
};

const LIVE_SCREEN_REQUEST_CHANNEL = "live_screen_requests";

export async function notifyLiveScreenRequest(notice: LiveScreenRequestNotice) {
  await db.execute(sql`select pg_notify(${LIVE_SCREEN_REQUEST_CHANNEL}, ${JSON.stringify(notice)})`);
}
