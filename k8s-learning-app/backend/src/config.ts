import { z } from "zod";

/**
 * All configuration comes from the environment — no config files, no defaults
 * baked into code paths that matter. This is the 12-factor rule, and it is what
 * lets the exact same image run locally, in staging and in production with only
 * a ConfigMap and a Secret changing underneath it.
 *
 * The process refuses to start if anything required is missing. Failing loudly
 * at boot is what you want in Kubernetes: the Pod crash-loops, `kubectl describe`
 * shows you why, and no traffic is ever routed to a half-configured process.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),

  CORS_ORIGIN: z.string().default(""),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SEED_ON_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  DEFAULT_ADMIN_EMAIL: z.string().email().optional(),
  DEFAULT_ADMIN_PASSWORD: z.string().min(10).optional(),
  DEFAULT_ADMIN_NAME: z.string().min(2).default("Local Admin"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  // Deliberately console.error, not the logger: the logger may itself depend on config.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
