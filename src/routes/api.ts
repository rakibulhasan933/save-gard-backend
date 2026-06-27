import { Router } from "express";
import authRouter from "./auth";
import childrenRouter from "./children";
import pairRouter from "./pair";
import liveScreenRouter from "./live-screen";
import appRulesRouter from "./app-rules";
import webRulesRouter from "./web-rules";

export function createApiRouter(httpPort: number) {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

 const isProduction = process.env.NODE_ENV === "production";

const apiUrl = isProduction
  ? "https://save-gard-api.duckdns.org"
  : `http://localhost:${httpPort}`;

const wsUrl = isProduction
  ? "wss://save-gard-api.duckdns.org/ws"
  : `ws://localhost:${httpPort}/ws`;

router.get("/", (_request, response) => {
  response.json({
    service: "super-sefty-backend",
    status: "ok",
    apiUrl,
    wsUrl,
  });
});

  router.use("/auth", authRouter);
  router.use("/children", childrenRouter);
  router.use("/child", pairRouter);
  router.use("/live-screen", liveScreenRouter);
  router.use("/app-rules", appRulesRouter);
  router.use("/web-rules", webRulesRouter);

  return router;
}
