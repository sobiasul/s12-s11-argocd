import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger";
import { isProd } from "../config";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not found" });
}

// Express identifies an error handler by its arity — all four parameters must be
// declared even though `next` is unused here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "validation failed",
      details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error({ err, reqId: req.id }, err.message);
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  // Anything reaching here is unexpected. Log it in full, tell the client nothing:
  // stack traces in an HTTP response are a gift to an attacker.
  logger.error({ err, reqId: req.id, path: req.path }, "unhandled error");
  res.status(500).json({
    error: "internal server error",
    ...(isProd ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}
