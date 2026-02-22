import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  createSession,
  createUser,
  deleteSession,
  getUserByUsername,
  getUserFromSession,
} from "./dashboard-db.js";

const SESSION_COOKIE = "kp_session";
const SESSION_DAYS = 7;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, "hex");
  if (candidate.length !== storedBuf.length) return false;
  return timingSafeEqual(candidate, storedBuf);
}

export function registerUser({ username, password, displayName }) {
  const exists = getUserByUsername(username);
  if (exists) throw new Error("用户名已存在");
  const passwordHash = hashPassword(password);
  return createUser({ username, passwordHash, displayName });
}

export function loginUser({ username, password }) {
  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("用户名或密码错误");
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  createSession({ userId: user.id, token, expiresAt });
  return { token, user: { id: user.id, username: user.username, display_name: user.display_name } };
}

export function logoutByToken(token) {
  if (!token) return;
  deleteSession(token);
}

export function getCookieMap(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

export function getSessionToken(req) {
  const cookies = getCookieMap(req);
  return cookies[SESSION_COOKIE] || "";
}

export function getAuthedUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  return getUserFromSession(token);
}

export function buildSetSessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 3600;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildClearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
