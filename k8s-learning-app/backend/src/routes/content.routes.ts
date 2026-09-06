import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { HttpError } from "../middleware/error";
import { optionalAuth } from "../middleware/auth";

export const contentRouter = Router();

/**
 * Content is public on purpose — a student should be able to look something up
 * mid-incident without signing in. Only progress and notes require an account.
 */

const OBJECT_COLUMNS = `
  id, kind, api_version AS "apiVersion", category, short_names AS "shortNames",
  namespaced, summary, explanation, when_to_use AS "whenToUse",
  key_fields AS "keyFields", example, related_ids AS "relatedIds",
  common_mistakes AS "commonMistakes", kubectl_tips AS "kubectlTips"
`;

contentRouter.get("/objects", optionalAuth, async (req, res, next) => {
  try {
    const q = z.object({
      category: z.string().optional(),
      search: z.string().max(120).optional(),
    }).parse(req.query);

    const where: string[] = [];
    const params: unknown[] = [];

    if (q.category) { params.push(q.category); where.push(`category = $${params.length}`); }
    if (q.search)   { params.push(q.search);   where.push(`search_vec @@ plainto_tsquery('english', $${params.length})`); }

    const sql = `
      SELECT ${OBJECT_COLUMNS}
        FROM k8s_objects
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY category, kind`;
    const { rows } = await pool.query(sql, params);
    res.json({ count: rows.length, objects: rows });
  } catch (err) { next(err); }
});

contentRouter.get("/objects/categories", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, count(*)::int AS count FROM k8s_objects GROUP BY category ORDER BY category`,
    );
    res.json({ categories: rows });
  } catch (err) { next(err); }
});

contentRouter.get("/objects/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${OBJECT_COLUMNS} FROM k8s_objects WHERE id = $1`, [req.params.id],
    );
    if (!rows[0]) throw new HttpError(404, `no object with id "${req.params.id}"`);

    // Hydrate related objects so the client does not need N extra round trips.
    const related = await pool.query(
      `SELECT id, kind, summary, category FROM k8s_objects
        WHERE id = ANY($1::text[]) ORDER BY kind`,
      [rows[0].relatedIds ?? []],
    );
    res.json({ object: rows[0], related: related.rows });
  } catch (err) { next(err); }
});

contentRouter.get("/commands", async (req, res, next) => {
  try {
    const q = z.object({
      category: z.string().optional(),
      search: z.string().max(120).optional(),
      danger: z.enum(["true", "false"]).optional(),
    }).parse(req.query);

    const where: string[] = [];
    const params: unknown[] = [];
    if (q.category) { params.push(q.category); where.push(`category = $${params.length}`); }
    if (q.danger)   { params.push(q.danger === "true"); where.push(`danger = $${params.length}`); }
    if (q.search)   { params.push(q.search); where.push(`search_vec @@ plainto_tsquery('english', $${params.length})`); }

    const { rows } = await pool.query(
      `SELECT id, category, command, description, example, notes, danger, tags
         FROM kubectl_commands
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY category, id`,
      params,
    );
    res.json({ count: rows.length, commands: rows });
  } catch (err) { next(err); }
});

contentRouter.get("/commands/categories", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, count(*)::int AS count FROM kubectl_commands GROUP BY category ORDER BY category`,
    );
    res.json({ categories: rows });
  } catch (err) { next(err); }
});

/** One search box across both content types. */
contentRouter.get("/search", async (req, res, next) => {
  try {
    const { q } = z.object({ q: z.string().min(2).max(120) }).parse(req.query);
    const [objects, commands] = await Promise.all([
      pool.query(
        `SELECT id, kind, summary, category, ts_rank(search_vec, plainto_tsquery('english',$1)) AS rank
           FROM k8s_objects WHERE search_vec @@ plainto_tsquery('english',$1)
          ORDER BY rank DESC LIMIT 15`, [q],
      ),
      pool.query(
        `SELECT id, command, description, category, danger,
                ts_rank(search_vec, plainto_tsquery('english',$1)) AS rank
           FROM kubectl_commands WHERE search_vec @@ plainto_tsquery('english',$1)
          ORDER BY rank DESC LIMIT 15`, [q],
      ),
    ]);
    res.json({ query: q, objects: objects.rows, commands: commands.rows });
  } catch (err) { next(err); }
});

/** Totals used by the dashboard to compute "x of y learned". */
contentRouter.get("/stats", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM k8s_objects)      AS objects,
              (SELECT count(*)::int FROM kubectl_commands) AS commands`,
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});
