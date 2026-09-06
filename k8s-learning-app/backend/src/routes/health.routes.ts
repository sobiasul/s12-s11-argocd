import { Router } from "express";
import { dbHealthy } from "../db/pool";

export const healthRouter = Router();

/**
 * Three endpoints, three different questions. Kubernetes asks each of them for a
 * different reason, and wiring them to the same handler is one of the most
 * common mistakes in a first deployment.
 *
 *   /healthz  liveness  — "is this process wedged?"  A failure gets the container
 *                         KILLED and restarted. It must NOT check the database:
 *                         if Postgres blips, restarting every API Pod makes an
 *                         outage worse, not better.
 *
 *   /readyz   readiness — "should this Pod receive traffic right now?" A failure
 *                         removes the Pod from Service endpoints but leaves it
 *                         running. This is where dependency checks belong.
 *
 *   /startupz startup   — "has it finished booting?" Suppresses the other two
 *                         until the process is up, so a slow start is not
 *                         mistaken for a hang.
 */

healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

healthRouter.get("/readyz", async (_req, res) => {
  const db = await dbHealthy();
  if (!db) {
    return res.status(503).json({ status: "not-ready", checks: { database: "unreachable" } });
  }
  res.json({ status: "ready", checks: { database: "ok" } });
});

let started = false;
export const markStarted = () => { started = true; };

healthRouter.get("/startupz", (_req, res) => {
  if (!started) return res.status(503).json({ status: "starting" });
  res.json({ status: "started" });
});
