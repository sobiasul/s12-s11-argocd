import client from "prom-client";
import type { NextFunction, Request, Response } from "express";

/**
 * Prometheus metrics on /metrics.
 *
 * Included because it is the other half of observability in Kubernetes: logs
 * tell you what happened in one request, metrics tell you what is happening
 * across all of them. Once this is running you can point a ServiceMonitor at it —
 * which is itself one of the objects explained in the app.
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "k8slearn_" });

const httpDuration = new client.Histogram({
  name: "k8slearn_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

const httpTotal = new client.Counter({
  name: "k8slearn_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    // req.route is undefined for unmatched paths; grouping them under "unmatched"
    // stops a scanner hitting random URLs from exploding metric cardinality.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : "unmatched";
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpTotal.inc(labels);
  });
  next();
}
