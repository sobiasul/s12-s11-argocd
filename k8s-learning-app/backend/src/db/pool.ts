import { Pool } from "pg";
import { config } from "../config";
import { logger } from "../logger";

/**
 * One connection pool for the whole process.
 *
 * Pool sizing matters more in Kubernetes than people expect: max connections is
 * per Pod, so the cluster-wide total is DB_POOL_MAX x replicas. Scale the
 * Deployment to 10 and a default Postgres (max_connections = 100) is suddenly
 * the bottleneck. That interaction is one of the first real lessons in running
 * stateful things behind stateless ones.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "idle postgres client error");
});

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Used by the readiness probe. Cheap on purpose — it runs every few seconds. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
