// The admin login: one password, a signed cookie, no user accounts.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const COOKIE = "wl_admin";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The key that signs cookies. It is kept on the volume, so a restart or a
 * redeploy does not log you out, and it is not the password itself.
 *
 * @param {string} dataDir
 * @returns {Buffer}
 */
export function sessionKey(dataDir) {
  const file = path.join(dataDir, "session.key");

  try {
    const existing = fs.readFileSync(file);
    if (existing.length >= 32) return existing;
  } catch {
    // First run.
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(file, key, { mode: 0o600 });
  return key;
}

/** Compare two strings without leaking where they differ. */
export function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest("base64url");
}

/**
 * Mint a cookie value that is good for twelve hours.
 *
 * @param {Buffer} key
 * @param {number} [now]
 */
export function issue(key, now = Date.now()) {
  const expires = String(now + MAX_AGE_MS);
  return `${expires}.${hmac(key, expires)}`;
}

/**
 * Is this cookie value one of ours, and still fresh?
 *
 * @param {Buffer} key
 * @param {string|undefined} value
 * @param {number} [now]
 */
export function verify(key, value, now = Date.now()) {
  if (typeof value !== "string" || !value.includes(".")) return false;

  const [expires, signature] = value.split(".", 2);
  if (!/^\d+$/.test(expires) || Number(expires) < now) return false;

  return sameSecret(hmac(key, expires), signature);
}

/**
 * A token tied to one session, put in every admin form and checked on POST,
 * so another site cannot make your browser approve somebody.
 *
 * @param {Buffer} key
 * @param {string} cookieValue
 */
export function csrfToken(key, cookieValue) {
  return hmac(key, `csrf:${cookieValue}`);
}

/** Express middleware factory: only signed-in admins get through. */
export function requireAdmin(key) {
  return (req, res, next) => {
    const value = readCookie(req.headers.cookie, COOKIE);

    if (!verify(key, value)) {
      res.redirect("/admin/login");
      return;
    }

    req.adminCookie = value;
    req.csrfToken = csrfToken(key, value);
    next();
  };
}

/** Put the session cookie on a response. */
export function setCookie(res, value, secure) {
  const parts = [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/** Take it off again. */
export function clearCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

/**
 * One cookie out of a Cookie header.
 *
 * @param {string|undefined} header
 * @param {string} name
 */
export function readCookie(header, name) {
  if (!header) return undefined;

  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }

  return undefined;
}
