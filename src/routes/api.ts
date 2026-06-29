import { Router } from "express";
import authRouter from "./auth";
import childrenRouter from "./children";
import pairRouter from "./pair";
import liveScreenRouter, { childLiveScreenRouter } from "./live-screen";
import appRulesRouter from "./app-rules";
import webRulesRouter from "./web-rules";

export function createApiRouter(httpPort: number) {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/", (_request, response) => {
    response.json({
      service: "super-sefty-backend",
      status: "ok",
      apiUrl: `http://localhost:${httpPort}`,
      wsUrl: `ws://localhost:${httpPort}/ws`
    });
  });

  router.use("/auth", authRouter);
  router.use("/children", childrenRouter);
  router.use("/children", childLiveScreenRouter);
  router.use("/child", pairRouter);
  router.use("/live-screen", liveScreenRouter);
  router.use("/app-rules", appRulesRouter);
  router.use("/web-rules", webRulesRouter);

  return router;
}
