import "./env.js";
import crypto from "node:crypto";
import {
  readUsers,
  writeUsers,
  getAccountById,
  getAccountByEmail,
  createAccount,
  publicAccount,
} from "./accounts.js";

const TOKEN_SECRET = process.env.AUTH_SECRET || "";

if (!TOKEN_SECRET && process.env.NODE_ENV === "production") {
  console.error(
    "WARNING: AUTH_SECRET is not set. Set it in Vercel Project Settings → Environment Variables (or backend/.env). Using a fallback secret until then."
  );
}

const EFFECTIVE_TOKEN_SECRET =
  TOKEN_SECRET ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  "canada-tornado-tracker-dev-secret-change-me";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", EFFECTIVE_TOKEN_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", EFFECTIVE_TOKEN_SECRET)
    .update(body)
    .digest("base64url");

  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export { readUsers, writeUsers };

export function getUserIdFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  return payload?.sub || null;
}

export function getUserFromRequest(req) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;

  const account = getAccountById(userId);
  return account ? publicAccount(account) : null;
}

export function signup({ email, password, name }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const displayName = String(name || "").trim();
  const plainPassword = String(password || "");

  if (!normalizedEmail || !plainPassword || !displayName) {
    throw new Error("Name, email, and password are required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email address");
  }
  if (plainPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  if (getAccountByEmail(normalizedEmail)) {
    throw new Error("An account with this email already exists");
  }

  const account = createAccount({
    email: normalizedEmail,
    name: displayName,
    passwordHash: hashPassword(plainPassword),
  });

  const token = signToken({
    sub: account.id,
    email: account.email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { user: publicAccount(account), token };
}

export function login({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const plainPassword = String(password || "");

  if (!normalizedEmail || !plainPassword) {
    throw new Error("Email and password are required");
  }

  const account = getAccountByEmail(normalizedEmail);
  if (!account || !verifyPassword(plainPassword, account.passwordHash)) {
    throw new Error("Invalid email or password");
  }

  const token = signToken({
    sub: account.id,
    email: account.email,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return { user: publicAccount(account), token };
}