import { pool } from "../db/pool";
import { hashPassword, verifyPassword } from "./password";

export type User = {
  id: number; email: string; display_name: string; role: string;
  created_at: string; last_login_at: string | null;
};

const PUBLIC_COLUMNS = "id, email, display_name, role, created_at, last_login_at";

export async function createUser(email: string, displayName: string, password: string): Promise<User> {
  const hash = await hashPassword(password);
  const { rows } = await pool.query<User>(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1,$2,$3) RETURNING ${PUBLIC_COLUMNS}`,
    [email.toLowerCase().trim(), displayName.trim(), hash],
  );
  return rows[0];
}

export async function findByEmail(email: string) {
  const { rows } = await pool.query<User & { password_hash: string }>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );
  return rows[0] ?? null;
}

export async function findById(id: number): Promise<User | null> {
  const { rows } = await pool.query<User>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const row = await findByEmail(email);
  if (!row) {
    // Hash anyway. Returning early on an unknown email makes the response
    // measurably faster, which turns login into an account-enumeration oracle.
    await hashPassword(password);
    return null;
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [row.id]);
  const { password_hash, ...user } = row;
  return user;
}

export async function emailExists(email: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [
    email.toLowerCase().trim(),
  ]);
  return (rowCount ?? 0) > 0;
}
