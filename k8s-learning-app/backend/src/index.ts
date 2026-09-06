import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { pool } from "./db/pool";
import { migrate } from "./db/migrate";
import { seed } from "./db/seed";
import { markStarted } from "./routes/health.routes";

/**
 * Entry point. Two things here are Kubernetes-specific and worth reading:
 *
 * 1. RUN_MIGRATIONS_ONLY — the same image is used as the initContainer. It runs
 *    migrations, seeds content, and exits 0. One image, two jobs, no drift
 *    between the migration tool and the app that depends on it.
 *
 * 2. Graceful shutdown on SIGTERM. When Kubernetes deletes a Pod it sends
 *    SIGTERM and starts a 30s clock before SIGKILL. A process that ignores
 *    SIGTERM drops every in-flight request on every rollout. Closing the server
 *    first, then the database pool, is what makes a deploy invisible to users.
 */
async function main() {
  if (process.env.RUN_MIGRATIONS_ONLY === "true") {
    logger.info("running migrations only");
    await migrate();
    if (config.SEED_ON_START) await seed();
    await pool.end();
    logger.info("migrations complete, exiting 0");
    process.exit(0);
  }

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    markStarted();
    logger.info({ port: config.PORT, env: config.NODE_ENV }, "api listening");
  });

  // Node does not stop accepting connections on its own; without this a rollout
  // can hang until SIGKILL.
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 60_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(async (err) => {
      if (err) logger.error({ err }, "error closing http server");
      try { await pool.end(); } catch (e) { logger.error({ err: e }, "error closing pg pool"); }
      process.exit(err ? 1 : 0);
    });
    // Backstop: if connections refuse to drain, exit before Kubernetes SIGKILLs us.
    setTimeout(() => {
      logger.error("forced exit after shutdown timeout");
      process.exit(1);
    }, 15_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal error during startup");
  process.exit(1);
});
