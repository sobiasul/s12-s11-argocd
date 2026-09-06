import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/auth";

export const progressRouter = Router();
progressRouter.use(requireAuth);

const itemSchema = z.object({
  itemType: z.enum(["object", "command"]),
  itemId: z.string().min(1).max(120),
  status: z.enum(["learning", "learned"]).default("learned"),
});

progressRouter.get("/", async (req, res, next) => {
  try {
    const userId = Number(req.user!.sub);
    const [items, summary] = await Promise.all([
      pool.query(
        `SELECT item_type AS "itemType", item_id AS "itemId", status, updated_at AS "updatedAt"
           FROM user_progress WHERE user_id = $1 ORDER BY updated_at DESC`, [userId],
      ),
      pool.query(
        `SELECT item_type AS "itemType", status, count(*)::int AS count
           FROM user_progress WHERE user_id = $1 GROUP BY item_type, status`, [userId],
      ),
    ]);
    res.json({ items: items.rows, summary: summary.rows });
  } catch (err) { next(err); }
});

progressRouter.put("/", async (req, res, next) => {
  try {
    const { itemType, itemId, status } = itemSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO user_progress (user_id, item_type, item_id, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, item_type, item_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = now()
       RETURNING item_type AS "itemType", item_id AS "itemId", status, updated_at AS "updatedAt"`,
      [Number(req.user!.sub), itemType, itemId, status],
    );
    res.json({ progress: rows[0] });
  } catch (err) { next(err); }
});

progressRouter.delete("/:itemType/:itemId", async (req, res, next) => {
  try {
    const { itemType, itemId } = z.object({
      itemType: z.enum(["object", "command"]),
      itemId: z.string().min(1).max(120),
    }).parse(req.params);
    await pool.query(
      `DELETE FROM user_progress WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
      [Number(req.user!.sub), itemType, itemId],
    );
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---- personal notes ---- */

progressRouter.get("/notes", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT item_type AS "itemType", item_id AS "itemId", body, updated_at AS "updatedAt"
         FROM user_notes WHERE user_id = $1 ORDER BY updated_at DESC`,
      [Number(req.user!.sub)],
    );
    res.json({ notes: rows });
  } catch (err) { next(err); }
});

progressRouter.put("/notes", async (req, res, next) => {
  try {
    const { itemType, itemId, body } = z.object({
      itemType: z.enum(["object", "command"]),
      itemId: z.string().min(1).max(120),
      body: z.string().max(10_000),
    }).parse(req.body);

    if (body.trim() === "") {
      await pool.query(
        `DELETE FROM user_notes WHERE user_id=$1 AND item_type=$2 AND item_id=$3`,
        [Number(req.user!.sub), itemType, itemId],
      );
      return res.status(204).end();
    }
    const { rows } = await pool.query(
      `INSERT INTO user_notes (user_id, item_type, item_id, body)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, item_type, item_id)
       DO UPDATE SET body = EXCLUDED.body, updated_at = now()
       RETURNING item_type AS "itemType", item_id AS "itemId", body, updated_at AS "updatedAt"`,
      [Number(req.user!.sub), itemType, itemId, body],
    );
    res.json({ note: rows[0] });
  } catch (err) { next(err); }
});
