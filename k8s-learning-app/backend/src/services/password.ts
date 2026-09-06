import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * No bcrypt, no argon2 — both are native addons that need a compiler in the
 * build image and can break on a base-image change. scrypt is memory-hard,
 * built in, and has zero install surface, which keeps the container small and
 * the Dockerfile boring. Boring is the goal.
 *
 * Stored format:  scrypt$N$r$p$<salt-b64>$<hash-b64>
 * The parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords.
 */
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, {
    N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: 256 * 1024 * 1024,
  });
  return [
    "scrypt", PARAMS.N, PARAMS.r, PARAMS.p,
    salt.toString("base64"), derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
    });
    // Constant-time compare: a plain === leaks timing information about how many
    // leading bytes matched, which is enough to attack a hash byte by byte.
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
