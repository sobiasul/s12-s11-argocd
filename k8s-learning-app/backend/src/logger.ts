import pino from "pino";
import { config, isProd } from "./config";

/**
 * Structured JSON logs on stdout. Nothing writes to a file and nothing rotates.
 *
 * That is not laziness — it is the contract a container has with Kubernetes. The
 * kubelet captures stdout/stderr, `kubectl logs` reads it back, and a collector
 * (Fluent Bit, Vector, Promtail) ships it onward. A process that writes its own
 * log files inside a container is writing to a filesystem that disappears on
 * restart, and that nothing is watching.
 *
 * In development we pretty-print for human eyes; in the cluster we emit raw JSON
 * so every field stays queryable.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: "k8s-learn-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "*.password",
    ],
    censor: "[redacted]",
  },
  transport: isProd
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});
