import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool";
import { logger } from "../logger";
import { config } from "../config";
import { hashPassword } from "../services/password";

/**
 * Load the reference content (Kubernetes objects + kubectl commands) into
 * Postgres. Idempotent: re-running updates rows in place rather than
 * duplicating them, so it is safe to run on every boot and safe to run
 * concurrently from more than one replica.
 */
const CONTENT_DIR = path.join(__dirname, "..", "..", "content");

type ObjectRow = {
  id: string; kind: string; apiVersion: string; category: string;
  shortNames: string[]; namespaced: boolean; summary: string; explanation: string;
  whenToUse: string[]; keyFields: { path: string; description: string }[];
  example: string; relatedIds: string[]; commonMistakes: string[]; kubectlTips: string[];
};

type CommandRow = {
  id: string; category: string; command: string; description: string;
  example: string | null; notes: string | null; danger: boolean; tags: string[];
};

function read<T>(file: string): T[] {
  const full = path.join(CONTENT_DIR, file);
  if (!fs.existsSync(full)) {
    logger.warn({ full }, "content file missing — skipping seed for it");
    return [];
  }
  return JSON.parse(fs.readFileSync(full, "utf8")) as T[];
}

export async function seed(): Promise<{ objects: number; commands: number }> {
  const objects = read<ObjectRow>("objects.json");
  const commands = read<CommandRow>("commands.json");

  if (config.DEFAULT_ADMIN_EMAIL && config.DEFAULT_ADMIN_PASSWORD) {
    const hash = await hashPassword(config.DEFAULT_ADMIN_PASSWORD);
    await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'`,
      [config.DEFAULT_ADMIN_EMAIL, config.DEFAULT_ADMIN_NAME, hash],
    );
    logger.info({ email: config.DEFAULT_ADMIN_EMAIL }, "default admin user seeded");
  }

  for (const o of objects) {
    await pool.query(
      `INSERT INTO k8s_objects
         (id, kind, api_version, category, short_names, namespaced, summary, explanation,
          when_to_use, key_fields, example, related_ids, common_mistakes, kubectl_tips)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind, api_version = EXCLUDED.api_version, category = EXCLUDED.category,
         short_names = EXCLUDED.short_names, namespaced = EXCLUDED.namespaced,
         summary = EXCLUDED.summary, explanation = EXCLUDED.explanation,
         when_to_use = EXCLUDED.when_to_use, key_fields = EXCLUDED.key_fields,
         example = EXCLUDED.example, related_ids = EXCLUDED.related_ids,
         common_mistakes = EXCLUDED.common_mistakes, kubectl_tips = EXCLUDED.kubectl_tips`,
      [
        o.id, o.kind, o.apiVersion, o.category,
        JSON.stringify(o.shortNames ?? []), o.namespaced, o.summary, o.explanation,
        JSON.stringify(o.whenToUse ?? []), JSON.stringify(o.keyFields ?? []),
        o.example, JSON.stringify(o.relatedIds ?? []),
        JSON.stringify(o.commonMistakes ?? []), JSON.stringify(o.kubectlTips ?? []),
      ],
    );
  }

  for (const c of commands) {
    await pool.query(
      `INSERT INTO kubectl_commands (id, category, command, description, example, notes, danger, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category, command = EXCLUDED.command,
         description = EXCLUDED.description, example = EXCLUDED.example,
         notes = EXCLUDED.notes, danger = EXCLUDED.danger, tags = EXCLUDED.tags`,
      [c.id, c.category, c.command, c.description, c.example, c.notes, c.danger, JSON.stringify(c.tags ?? [])],
    );
  }

  logger.info({ objects: objects.length, commands: commands.length }, "content seeded");
  return { objects: objects.length, commands: commands.length };
}
