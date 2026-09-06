import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool";
import { config } from "../config";

export type AccessClaims = { sub: string; email: string; role: string };

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, {
    // ACCESS_TOKEN_TTL comes from the environment as a plain string ("15m"), but
    // @types/jsonwebtoken narrows this to a template-literal type it cannot infer
    // from a runtime value. The cast is the assertion that the env var is valid.
    expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: "k8s-learn",
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config.JWT_SECRET, { issuer: "k8s-learn" }) as AccessClaims;
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/**
 * Refresh tokens are opaque random strings, not JWTs. A JWT refresh token cannot
 * be revoked before it expires; a row in a table can be deleted. Only the SHA-256
 * of the token is stored, so a database dump does not hand over live sessions.
 */
export async function issueRefreshToken(userId: number, userAgent?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("base64url");
  const expires = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4)`,
    [userId, sha256(raw), expires, userAgent ?? null],
  );
  return raw;
}

export async function consumeRefreshToken(raw: string): Promise<number | null> {
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sha256(raw)],
  );
  if (rows.length === 0) return null;
  // Rotation: the old token dies the moment it is used. If an attacker replays a
  // stolen refresh token after the real user has already used it, it is dead.
  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [rows[0].id]);
  return Number(rows[0].user_id);
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [sha256(raw)],
  );
}

export async function revokeAllForUser(userId: number): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}
