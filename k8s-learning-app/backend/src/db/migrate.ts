import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool";
import { logger } from "../logger";

/**
 * A deliberately small migration runner: apply every .sql file in
 * src/db/migrations in filename order, exactly once, inside a transaction,
 * recording what ran.
 *
 * In Kubernetes this is invoked from an initContainer, NOT from the API
 * container. That matters. If migrations ran on app startup with 3 replicas,
 * three Pods would race to alter the same schema. The initContainer runs to
 * completion before the app container starts, and because the whole thing is
 * one transaction per file, a failure leaves nothing half-applied.
 */
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map(
      (r) => r.filename,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      logger.debug({ file }, "migration already applied");
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info({ file }, "migration applied");
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err, file }, "migration failed");
      throw err;
    } finally {
      client.release();
    }
  }
}
