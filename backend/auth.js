import "./env.js";
import crypto from "node:crypto";
import {
  readUsers,
  writeUsers,
  getAccountById,
  getAccountByEmail,
  createAccount,
  publicAccount,
  rehydrateAccountFromToken,
  updateAccount,
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

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
    if (hash.length !== attempt.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
  } catch {
    return false;
  }
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

function tokenForAccount(account) {
  return signToken({
    sub: account.id,
    email: account.email,
    name: account.name,
    exp: Date.now() + TOKEN_TTL_MS,
  });
}

function getTokenPayloadFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return verifyToken(token);
}

export { readUsers, writeUsers };

export function getUserIdFromRequest(req) {
  const payload = getTokenPayloadFromRequest(req);
  if (!payload?.sub) return null;

  // Ensure account exists on this instance (Vercel /tmp is not shared)
  const account =
    getAccountById(payload.sub) || rehydrateAccountFromToken(payload);
  return account?.id || payload.sub;
}

export function getUserFromRequest(req) {
  const payload = getTokenPayloadFromRequest(req);
  if (!payload?.sub) return null;

  const account =
    getAccountById(payload.sub) || rehydrateAccountFromToken(payload);
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

  const existing = getAccountByEmail(normalizedEmail);
  if (existing && !existing.rehydrated) {
    throw new Error("An account with this email already exists");
  }

  // If only a serverless rehydrated shell exists, upgrade it into a real account
  if (existing?.rehydrated) {
    const account = updateAccount(existing.id, {
      name: displayName,
      passwordHash: hashPassword(plainPassword),
      rehydrated: false,
    });
    return { user: publicAccount(account), token: tokenForAccount(account) };
  }

  const account = createAccount({
    email: normalizedEmail,
    name: displayName,
    passwordHash: hashPassword(plainPassword),
  });

  return { user: publicAccount(account), token: tokenForAccount(account) };
}

export function login({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const plainPassword = String(password || "");

  if (!normalizedEmail || !plainPassword) {
    throw new Error("Email and password are required");
  }

  let account = getAccountByEmail(normalizedEmail);
  if (!account) {
    throw new Error("Invalid email or password");
  }

  // After a cold start the password hash may be missing; bind password on login
  if (account.rehydrated || !account.passwordHash) {
    if (plainPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    account = updateAccount(account.id, {
      passwordHash: hashPassword(plainPassword),
      rehydrated: false,
    });
  } else if (!verifyPassword(plainPassword, account.passwordHash)) {
    throw new Error("Invalid email or password");
  }

  return { user: publicAccount(account), token: tokenForAccount(account) };
}
