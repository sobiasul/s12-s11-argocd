import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import crypto from "node:crypto";

import { config } from "./config";
import { logger } from "./logger";
import { errorHandler, notFound } from "./middleware/error";
import { metricsMiddleware, registry } from "./middleware/metrics";
import { authRouter } from "./routes/auth.routes";
import { contentRouter } from "./routes/content.routes";
import { progressRouter } from "./routes/progress.routes";
import { healthRouter } from "./routes/health.routes";

export function createApp() {
  const app = express();

  // Behind an Ingress controller there is always at least one proxy hop. Without
  // this, req.ip is the proxy and every rate limit and access log is wrong.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  if (config.CORS_ORIGIN) {
    app.use(cors({ origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: true }));
  }

  // Correlation id: accept one from the ingress if present, otherwise mint it.
  // Every log line for a request carries it, which is how you follow a single
  // request across replicas in `kubectl logs -l app=...`.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = (req.headers["x-request-id"] as string) || crypto.randomUUID();
        res.setHeader("x-request-id", existing);
        return existing;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      autoLogging: {
        // Probes fire every few seconds; logging them buries everything else.
        ignore: (req) => ["/healthz", "/readyz", "/startupz", "/metrics"].includes(req.url ?? ""),
      },
    }),
  );

  app.use(metricsMiddleware);

  // Probes and metrics sit OUTSIDE /api so they are trivially excluded from the
  // Ingress and never exposed to the internet.
  app.use("/", healthRouter);
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  app.use("/api/auth", authRouter);
  app.use("/api/content", contentRouter);
  app.use("/api/progress", progressRouter);

  app.get("/api", (_req, res) => {
    res.json({
      name: "k8s-learn-api",
      endpoints: [
        "POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/refresh",
        "POST /api/auth/logout", "GET  /api/auth/me",
        "GET  /api/content/objects", "GET /api/content/objects/:id",
        "GET  /api/content/commands", "GET /api/content/search", "GET /api/content/stats",
        "GET  /api/progress", "PUT /api/progress", "DELETE /api/progress/:type/:id",
      ],
    });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
