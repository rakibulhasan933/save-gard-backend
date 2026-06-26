import type { IncomingMessage } from "node:http";
import { eq } from "drizzle-orm";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { db, queryClient } from "../db";
import { childDevices, children, liveScreenSessions } from "../db/schema";
import {
  bindLiveScreenTarget,
  broadcastToAdmin,
  broadcastToChild,
  clearLiveScreenTarget,
  getChildDeviceSocket,
  getLiveScreenTarget,
  getSocketContext,
  registerAdminSocket,
  registerChildSocket,
  sendError,
  sendJson,
  unregisterSocket
} from "./connections";
import {
  authMessageSchema,
  clientMessageSchema,
  type ClientMessage,
  type Quality,
  type ServerMessage,
  type WebRtcSignalMessage
} from "./messageTypes";
import { verifySessionToken } from "../lib/auth";
import { verifyChildToken } from "../lib/childToken";

export type SignalingServerOptions = {
  path?: string;
};

export type LiveScreenRequestOptions = {
  quality?: Quality;
  maxDurationSec?: number;
};

const DEFAULT_QUALITY: Quality = "medium";
const DEFAULT_MAX_DURATION_SEC = 300;
const CHILD_STATUS_STALE_MS = 120_000;
const LIVE_SCREEN_REQUEST_CHANNEL = "live_screen_requests";

export function createSignalingServer(options: SignalingServerOptions = {}) {
  const wss = new WebSocketServer({
    noServer: true
  });

  wss.on("connection", (ws, request) => {
    void authenticateFromRequest(ws, request).then((authenticated) => {
      if (authenticated) {
        attachMessageHandlers(ws);
        return;
      }

      waitForAuthMessage(ws);
    });
  });

  return wss;
}

export function handleUpgrade(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: import("node:net").Socket,
  head: Buffer,
  path = "/ws"
) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== path) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
}

async function authenticateFromRequest(ws: WebSocket, request: IncomingMessage) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");
  const deviceUuid = url.searchParams.get("deviceUuid");

  if (!role) return false;

  if (role === "admin" && !token) {
    ws.close(4002, "Invalid auth parameters");
    return true;
  }

  if (!token) return false;

  if (role === "admin") {
    const admin = await verifySessionToken(token);
    if (!admin) {
      ws.close(4001, "Unauthorized");
      return true;
    }
    registerAdminSocket(admin.adminId, ws);
    return true;
  }

  if (role === "child" && deviceUuid) {
    const child = await verifyChildToken(token);
    if (!child) {
      ws.close(4001, "Unauthorized");
      return true;
    }
    registerChildSocket(child.id, deviceUuid, ws);
    return true;
  }

  ws.close(4002, "Invalid auth parameters");
  return true;
}

function waitForAuthMessage(ws: WebSocket) {
  const authTimeout = setTimeout(() => {
    ws.close(4001, "Authentication timeout");
  }, 10_000);

  const handleAuth = (data: RawData) => {
    void (async () => {
      const message = parseJson(data);
      const parsed = authMessageSchema.safeParse(message);

      if (!parsed.success) {
        clearTimeout(authTimeout);
        ws.close(4002, "Invalid auth message");
        return;
      }

      if (parsed.data.type === "AUTH_ADMIN") {
        const admin = await verifySessionToken(parsed.data.payload.token);
        if (!admin) {
          clearTimeout(authTimeout);
          ws.close(4001, "Unauthorized");
          return;
        }
        registerAdminSocket(admin.adminId, ws);
      } else {
        const child = await verifyChildToken(parsed.data.payload.token);
        if (!child) {
          clearTimeout(authTimeout);
          ws.close(4001, "Unauthorized");
          return;
        }
        registerChildSocket(child.id, parsed.data.payload.deviceUuid, ws);
      }

      clearTimeout(authTimeout);
      ws.off("message", handleAuth);
      attachMessageHandlers(ws);
    })().catch(() => {
      clearTimeout(authTimeout);
      ws.close(1011, "Authentication failed");
    });
  };

  ws.on("message", handleAuth);
  ws.on("close", () => clearTimeout(authTimeout));
}

function attachMessageHandlers(ws: WebSocket) {
  ws.on("message", (data) => {
    void handleMessage(ws, data).catch(() => {
      sendError(ws, "INTERNAL_ERROR", "Unable to process message");
    });
  });

  ws.on("close", () => {
    unregisterSocket(ws);
  });
}

async function handleMessage(ws: WebSocket, data: RawData) {
  const raw = parseJson(data);
  if (!raw) {
    sendError(ws, "INVALID_JSON", "Message must be valid JSON");
    return;
  }

  const parsed = clientMessageSchema.safeParse(raw);
  if (!parsed.success) {
    if (raw && typeof raw === "object" && (raw as { type?: unknown }).type === "STATUS_UPDATE") {
      console.warn("[ws] Rejected malformed STATUS_UPDATE", {
        issues: parsed.error.issues,
        raw
      });
    }
    sendError(ws, "INVALID_MESSAGE", "Message type or payload is invalid");
    return;
  }

  const context = getSocketContext(ws);
  if (!context) {
    sendError(ws, "UNAUTHORIZED", "Socket is not authenticated");
    return;
  }

  const message = parsed.data;

  switch (message.type) {
    case "PING":
      sendJson(ws, { type: "PONG", payload: {} });
      return;
    case "PONG":
      return;
    case "STATUS_UPDATE":
      await handleStatusUpdate(ws, message);
      return;
    case "LIVE_SCREEN_ACCEPTED":
      await handleLiveScreenAccepted(ws, message);
      return;
    case "LIVE_SCREEN_REJECTED":
      await handleLiveScreenRejected(ws, message);
      return;
    case "LIVE_SCREEN_ENDED":
      await handleLiveScreenEnded(ws, message);
      return;
    case "WEBRTC_OFFER":
    case "WEBRTC_ANSWER":
    case "WEBRTC_ICE_CANDIDATE":
      await relayWebRtcSignal(ws, message);
      return;
  }
}

async function handleStatusUpdate(ws: WebSocket, message: Extract<ClientMessage, { type: "STATUS_UPDATE" }>) {
  const context = getSocketContext(ws);
  if (context?.role !== "child") {
    sendError(ws, "FORBIDDEN", "Only child sockets can send status updates");
    return;
  }

  if (message.payload.childId !== context.childId || message.payload.deviceUuid !== context.deviceUuid) {
    sendError(ws, "FORBIDDEN", "Status update identity does not match socket identity");
    return;
  }

  const [child] = await db
    .update(children)
    .set({ lastSeenAt: new Date() })
    .where(eq(children.id, context.childId))
    .returning();

  if (!child) {
    sendError(ws, "NOT_FOUND", "Child not found");
    return;
  }

  await db
    .update(childDevices)
    .set({ lastOnlineAt: new Date(), updatedAt: new Date() })
    .where(eq(childDevices.deviceUuid, context.deviceUuid));

  broadcastToAdmin(child.adminId, message);
}

async function handleLiveScreenAccepted(
  ws: WebSocket,
  message: Extract<ClientMessage, { type: "LIVE_SCREEN_ACCEPTED" }>
) {
  const context = getSocketContext(ws);
  if (context?.role !== "child") {
    sendError(ws, "FORBIDDEN", "Only child sockets can accept live screen sessions");
    return;
  }

  const session = await getSession(message.payload.sessionId);
  if (!session || session.childId !== context.childId || message.payload.childId !== context.childId) {
    sendError(ws, "NOT_FOUND", "Live screen session not found");
    return;
  }

  bindLiveScreenTarget({
    sessionId: session.id,
    adminId: session.adminId,
    childId: session.childId,
    deviceUuid: context.deviceUuid
  });

  await db
    .update(liveScreenSessions)
    .set({ status: "active", startedAt: new Date(), reason: null })
    .where(eq(liveScreenSessions.id, session.id));

  broadcastToAdmin(session.adminId, message);
}

async function handleLiveScreenRejected(
  ws: WebSocket,
  message: Extract<ClientMessage, { type: "LIVE_SCREEN_REJECTED" }>
) {
  const context = getSocketContext(ws);
  if (context?.role !== "child") {
    sendError(ws, "FORBIDDEN", "Only child sockets can reject live screen sessions");
    return;
  }

  const session = await getSession(message.payload.sessionId);
  if (!session || session.childId !== context.childId || message.payload.childId !== context.childId) {
    sendError(ws, "NOT_FOUND", "Live screen session not found");
    return;
  }

  clearLiveScreenTarget(session.id);
  await db
    .update(liveScreenSessions)
    .set({ status: "failed", endedAt: new Date(), reason: message.payload.reason })
    .where(eq(liveScreenSessions.id, session.id));

  broadcastToAdmin(session.adminId, message);
}

async function handleLiveScreenEnded(
  ws: WebSocket,
  message: Extract<ClientMessage, { type: "LIVE_SCREEN_ENDED" }>
) {
  const context = getSocketContext(ws);
  if (!context) return;

  const session = await getSession(message.payload.sessionId);
  if (!session || session.childId !== message.payload.childId) {
    sendError(ws, "NOT_FOUND", "Live screen session not found");
    return;
  }

  if (context.role === "admin" && context.adminId !== session.adminId) {
    sendError(ws, "FORBIDDEN", "Admin does not own this live screen session");
    return;
  }

  if (context.role === "child" && context.childId !== session.childId) {
    sendError(ws, "FORBIDDEN", "Child does not own this live screen session");
    return;
  }

  await db
    .update(liveScreenSessions)
    .set({ status: "ended", endedAt: new Date(), reason: message.payload.reason })
    .where(eq(liveScreenSessions.id, session.id));

  relayToOtherSide(context, session.adminId, session.childId, session.id, message);
  clearLiveScreenTarget(session.id);
}

async function relayWebRtcSignal(ws: WebSocket, message: WebRtcSignalMessage) {
  const context = getSocketContext(ws);
  if (!context) return;

  const session = await getSession(message.payload.sessionId);
  if (!session) {
    sendError(ws, "NOT_FOUND", "Live screen session not found");
    return;
  }

  if (context.role !== message.payload.fromRole) {
    sendError(ws, "FORBIDDEN", "fromRole does not match socket identity");
    return;
  }

  if (context.role === "admin" && context.adminId !== session.adminId) {
    sendError(ws, "FORBIDDEN", "Admin does not own this live screen session");
    return;
  }

  if (context.role === "child" && context.childId !== session.childId) {
    sendError(ws, "FORBIDDEN", "Child does not own this live screen session");
    return;
  }

  relayToOtherSide(context, session.adminId, session.childId, session.id, message);
}

function relayToOtherSide(
  context: NonNullable<ReturnType<typeof getSocketContext>>,
  adminId: string,
  childId: string,
  sessionId: string,
  message: ServerMessage
) {
  if (context.role === "child") {
    broadcastToAdmin(adminId, message);
    return;
  }

  const target = getLiveScreenTarget(sessionId);
  const childSocket = target?.deviceUuid ? getChildDeviceSocket(childId, target.deviceUuid) : null;

  if (!childSocket) {
    sendError(context.ws, "CHILD_OFFLINE", "No accepted child device is connected for this session");
    return;
  }

  sendJson(childSocket, message);
}

export async function signalLiveScreenRequest(
  sessionId: string,
  options: LiveScreenRequestOptions = {}
) {
  const session = await getSession(sessionId);
  if (!session) {
    return { delivered: 0, reason: "SESSION_NOT_FOUND" as const };
  }

  bindLiveScreenTarget({
    sessionId: session.id,
    adminId: session.adminId,
    childId: session.childId
  });

  const message = {
    type: "LIVE_SCREEN_REQUEST",
    payload: {
      sessionId: session.id,
      childId: session.childId,
      adminId: session.adminId,
      quality: options.quality ?? DEFAULT_QUALITY,
      maxDurationSec: options.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC
    }
  } satisfies ServerMessage;

  const delivered = broadcastToChild(session.childId, message);
  if (delivered > 0) {
    return { delivered, reason: null };
  }

  const offlineReason = await describeChildOfflineReason(session.childId);
  console.warn("[ws] LIVE_SCREEN_REQUEST could not be delivered", {
    sessionId: session.id,
    childId: session.childId,
    adminId: session.adminId,
    reason: offlineReason
  });

  return { delivered, reason: offlineReason };
}

export async function startLiveScreenRequestListener() {
  const listen = (queryClient as unknown as {
    listen?: (channel: string, callback: (payload: string) => void | Promise<void>) => Promise<void>;
  }).listen;

  if (!listen) {
    console.warn("[ws] Database client does not support LISTEN/NOTIFY");
    return;
  }

  await listen.call(queryClient, LIVE_SCREEN_REQUEST_CHANNEL, async (payload) => {
    try {
      const parsed = JSON.parse(payload) as { sessionId?: string };
      if (!parsed.sessionId) return;
      await signalLiveScreenRequest(parsed.sessionId);
    } catch (error) {
      console.warn("[ws] Ignored invalid live screen notify payload", error);
    }
  });
}

async function describeChildOfflineReason(childId: string) {
  const [child] = await db
    .select({ lastSeenAt: children.lastSeenAt, status: children.status })
    .from(children)
    .where(eq(children.id, childId))
    .limit(1);

  if (!child) {
    return "Child record not found";
  }

  if (!child.lastSeenAt) {
    return "Child considered offline because no STATUS_UPDATE has been received yet";
  }

  if (child.status === "disabled") {
    return "Child is disabled";
  }

  const ageMs = Date.now() - child.lastSeenAt.getTime();
  if (ageMs > CHILD_STATUS_STALE_MS) {
    return `Child considered offline because no STATUS_UPDATE within ${Math.round(
      CHILD_STATUS_STALE_MS / 1000
    )} seconds`;
  }

  return "Child socket is not connected to the signaling server";
}

async function getSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(liveScreenSessions)
    .where(eq(liveScreenSessions.id, sessionId))
    .limit(1);

  return session ?? null;
}

function parseJson(data: RawData) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}
