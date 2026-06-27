import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import express from "express";
import { sql } from "drizzle-orm";
import { buildCorsHeaders, sendNoContent } from "./lib/http";
import { getServerConfig } from "./lib/server-config";

function envFiles(isDev: boolean) {
  return isDev
    ? [".env.development.local", ".env.local", ".env.development", ".env"]
    : [".env.production.local", ".env.local", ".env.production", ".env"];
}

const dev = process.env.NODE_ENV !== "production";

for (const file of envFiles(dev)) {
  const localPath = resolve(process.cwd(), file);
  if (existsSync(localPath)) loadDotenv({ path: localPath, override: false });
}

void main().catch((error) => {
  console.error(formatStartupError(error));
  process.exit(1);
});

async function main() {
  const { httpPort } = getServerConfig();
  const { db } = await import("./db");

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    throw new Error(`Unable to connect to DATABASE_URL at startup: ${formatStartupError(error)}`);
  }

  const [
    { createApiRouter },
    { createSignalingServer, handleUpgrade, startLiveScreenRequestListener }
  ] = await Promise.all([import("./routes/api"), import("./realtime/signalingServer")]);

  const signalingServer = createSignalingServer({ path: "/ws" });

  const app = express();
  app.disable("x-powered-by");

  app.use((request, response, next) => {
    if ((request.method ?? "GET").toUpperCase() === "OPTIONS") {
      sendNoContent(response, 204, buildCorsHeaders(request));
      return;
    }

    next();
  });

  const apiRouter = createApiRouter(httpPort);
  app.use("/", apiRouter);
  app.use("/api", apiRouter);

  const server = createServer(app);

  server.on("upgrade", (request, socket, head) => {
    handleUpgrade(signalingServer, request, socket as import("node:net").Socket, head, "/ws");
  });

  await startLiveScreenRequestListener();

  server.listen(httpPort, "0.0.0.0", () => {
    if (dev) {
      console.log(`> Backend API ready on http://localhost:${httpPort}`);
      console.log(`> WebSocket signaling ready on ws://localhost:${httpPort}/ws`);
    } else {
      console.log(`> Backend API ready on http://save-gard-api.duckdns.org`);
      console.log(`> WebSocket signaling ready on wss://save-gard-api.duckdns.org/ws`);
    }
  });
}

function formatStartupError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
