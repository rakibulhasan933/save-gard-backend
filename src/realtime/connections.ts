import type WebSocket from "ws";
import type { ServerMessage } from "./messageTypes";

export type AdminConnection = {
  role: "admin";
  adminId: string;
  ws: WebSocket;
};

export type ChildConnection = {
  role: "child";
  childId: string;
  deviceUuid: string;
  ws: WebSocket;
};

export type ConnectionContext = AdminConnection | ChildConnection;

export type LiveScreenTarget = {
  sessionId: string;
  adminId: string;
  childId: string;
  deviceUuid?: string;
};

const adminSockets = new Map<string, Set<WebSocket>>();
const childSockets = new Map<string, Map<string, WebSocket>>();
const socketContexts = new WeakMap<WebSocket, ConnectionContext>();
const liveScreenTargets = new Map<string, LiveScreenTarget>();

export function registerAdminSocket(adminId: string, ws: WebSocket) {
  const sockets = adminSockets.get(adminId) ?? new Set<WebSocket>();
  sockets.add(ws);
  adminSockets.set(adminId, sockets);
  socketContexts.set(ws, { role: "admin", adminId, ws });
}

export function registerChildSocket(childId: string, deviceUuid: string, ws: WebSocket) {
  const devices = childSockets.get(childId) ?? new Map<string, WebSocket>();
  const existingSocket = devices.get(deviceUuid);

  if (existingSocket && existingSocket !== ws) {
    existingSocket.close(4000, "Replaced by a newer connection");
  }

  devices.set(deviceUuid, ws);
  childSockets.set(childId, devices);
  socketContexts.set(ws, { role: "child", childId, deviceUuid, ws });
  console.info("[ws] child registered", {
    childId,
    deviceUuid,
    connectedDevicesForChild: devices.size
  });
}

export function unregisterSocket(ws: WebSocket) {
  const context = socketContexts.get(ws);
  if (!context) return;

  if (context.role === "admin") {
    const sockets = adminSockets.get(context.adminId);
    sockets?.delete(ws);
    if (sockets?.size === 0) adminSockets.delete(context.adminId);
  } else {
    const devices = childSockets.get(context.childId);
    if (devices?.get(context.deviceUuid) === ws) {
      devices.delete(context.deviceUuid);
    }
    if (devices?.size === 0) childSockets.delete(context.childId);
  }
}

export function getSocketContext(ws: WebSocket) {
  return socketContexts.get(ws) ?? null;
}

export function getAdminSockets(adminId: string) {
  return adminSockets.get(adminId) ?? new Set<WebSocket>();
}

export function getChildDeviceSocket(childId: string, deviceUuid: string) {
  return childSockets.get(childId)?.get(deviceUuid) ?? null;
}

export function getChildSockets(childId: string) {
  return Array.from(childSockets.get(childId)?.values() ?? []);
}

export function bindLiveScreenTarget(target: LiveScreenTarget) {
  liveScreenTargets.set(target.sessionId, target);
}

export function getLiveScreenTarget(sessionId: string) {
  return liveScreenTargets.get(sessionId) ?? null;
}

export function clearLiveScreenTarget(sessionId: string) {
  liveScreenTargets.delete(sessionId);
}

export function sendJson(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

export function sendError(ws: WebSocket, code: string, message: string) {
  if (ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify({ type: "ERROR", payload: { code, message } }));
  return true;
}

export function broadcastToAdmin(adminId: string, message: ServerMessage) {
  let delivered = 0;
  for (const ws of getAdminSockets(adminId)) {
    if (sendJson(ws, message)) delivered += 1;
  }
  return delivered;
}

export function broadcastToChild(childId: string, message: ServerMessage) {
  let delivered = 0;
  const sockets = getChildSockets(childId);
  for (const ws of sockets) {
    if (sendJson(ws, message)) delivered += 1;
  }
  console.info("[ws] broadcast to child", {
    childId,
    type: message.type,
    connectedSockets: sockets.length,
    delivered
  });
  return delivered;
}
