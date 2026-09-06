import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config, isProd } from "../config";
import { HttpError } from "../middleware/error";
import { ACCESS_COOKIE, REFRESH_COOKIE, requireAuth } from "../middleware/auth";
import * as users from "../services/users";
import * as tokens from "../services/tokens";
import { logger } from "../logger";

export const authRouter = Router();

/**
 * Rate limit the credential endpoints only. Behind an Ingress every request
 * appears to come from the ingress controller unless `trust proxy` is set on the
 * app — which app.ts does. Without that, this limiter would throttle the whole
 * cluster as if it were one client.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too many attempts, try again later" },
});

const credentials = z.object({
  email: z.string().email("must be a valid email address").max(255),
  password: z.string().min(10, "password must be at least 10 characters").max(200),
});

const registration = credentials.extend({
  displayName: z.string().min(2, "name must be at least 2 characters").max(80),
});

function setSessionCookies(res: import("express").Response, access: string, refresh: string) {
  const base = {
    httpOnly: true,          // JavaScript cannot read it, so XSS cannot steal it
    secure: config.COOKIE_SECURE, // HTTPS only in the cluster; off for local http
    sameSite: "lax" as const,
    path: "/",
  };
  res.cookie(ACCESS_COOKIE, access, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, {
    ...base,
    path: "/api/auth",       // the refresh token is sent only where it is needed
    maxAge: config.REFRESH_TOKEN_DAYS * 86_400_000,
  });
}

function clearSessionCookies(res: import("express").Response) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password, displayName } = registration.parse(req.body);
    if (await users.emailExists(email)) {
      throw new HttpError(409, "an account with that email already exists");
    }
    const user = await users.createUser(email, displayName, password);
    const access = tokens.signAccessToken({ sub: String(user.id), email: user.email, role: user.role });
    const refresh = await tokens.issueRefreshToken(user.id, req.get("user-agent") ?? undefined);
    setSessionCookies(res, access, refresh);
    logger.info({ userId: user.id, event: "user.registered" }, "new account created");
    res.status(201).json({ user, accessToken: access });
  } catch (err) { next(err); }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    const user = await users.authenticate(email, password);
    if (!user) {
      // One message for both "no such user" and "wrong password" — anything more
      // specific tells an attacker which emails are registered.
      logger.warn({ email, event: "auth.failed" }, "failed login");
      throw new HttpError(401, "invalid email or password");
    }
    const access = tokens.signAccessToken({ sub: String(user.id), email: user.email, role: user.role });
    const refresh = await tokens.issueRefreshToken(user.id, req.get("user-agent") ?? undefined);
    setSessionCookies(res, access, refresh);
    logger.info({ userId: user.id, event: "auth.login" }, "login succeeded");
    res.json({ user, accessToken: access });
  } catch (err) { next(err); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new HttpError(401, "no refresh token");
    const userId = await tokens.consumeRefreshToken(raw);
    if (!userId) throw new HttpError(401, "refresh token expired or already used");
    const user = await users.findById(userId);
    if (!user) throw new HttpError(401, "account no longer exists");
    const access = tokens.signAccessToken({ sub: String(user.id), email: user.email, role: user.role });
    const refresh = await tokens.issueRefreshToken(user.id, req.get("user-agent") ?? undefined);
    setSessionCookies(res, access, refresh);
    res.json({ user, accessToken: access });
  } catch (err) { next(err); }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await tokens.revokeRefreshToken(raw);
    clearSessionCookies(res);
    res.status(204).end();
  } catch (err) { next(err); }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await users.findById(Number(req.user!.sub));
    if (!user) throw new HttpError(404, "account not found");
    res.json({ user });
  } catch (err) { next(err); }
});

// Sign out everywhere — useful after a password scare, and a good excuse to see
// that revoking sessions is only possible because refresh tokens live in a table.
authRouter.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await tokens.revokeAllForUser(Number(req.user!.sub));
    clearSessionCookies(res);
    res.status(204).end();
  } catch (err) { next(err); }
});
