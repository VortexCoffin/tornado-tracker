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
  saveAccountFromBackup,
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
const BACKUP_SALT = "canada-tornado-tracker-account-backup-v1";

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
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(attempt, "hex")
    );
  } catch {
    return false;
  }
}

function deriveBackupKey() {
  return crypto.scryptSync(EFFECTIVE_TOKEN_SECRET, BACKUP_SALT, 32);
}

/** Encrypt full account (incl. password hash) for browser localStorage backup. */
export function sealAccount(account) {
  if (!account?.id || !account?.email) return null;

  const payload = JSON.stringify({
    id: account.id,
    email: account.email,
    name: account.name,
    passwordHash: account.passwordHash || "",
    createdAt: account.createdAt,
    subscription: account.subscription,
    preferences: account.preferences,
    notifications: account.notifications,
    sentAlertIds: account.sentAlertIds || [],
  });

  const key = deriveBackupKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/** Decrypt account backup from client. */
export function openAccountBackup(blob) {
  if (!blob || typeof blob !== "string") return null;
  try {
    const raw = Buffer.from(blob, "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const key = deriveBackupKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    const account = JSON.parse(json);
    if (!account?.id || !account?.email || !account?.passwordHash) return null;
    return account;
  } catch {
    return null;
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

function backupFromRequest(req) {
  return (
    req.headers["x-account-backup"] ||
    req.headers["X-Account-Backup"] ||
    null
  );
}

/**
 * Load account for this request: memory/disk → encrypted backup header → JWT shell.
 */
export function resolveAccountFromRequest(req) {
  const payload = getTokenPayloadFromRequest(req);
  if (!payload?.sub) return null;

  let account = getAccountById(payload.sub);

  // Prefer encrypted backup when local store is empty or missing password
  if (!account?.passwordHash) {
    const restored = openAccountBackup(backupFromRequest(req));
    if (restored && restored.id === payload.sub) {
      account = saveAccountFromBackup(restored);
    } else if (
      restored &&
      restored.email === String(payload.email || "").toLowerCase()
    ) {
      account = saveAccountFromBackup(restored);
    }
  }

  if (!account) {
    account = rehydrateAccountFromToken(payload);
  }

  return account;
}

export function sessionForAccount(account) {
  return {
    user: publicAccount(account),
    token: tokenForAccount(account),
    accountBackup: sealAccount(account),
  };
}

export { readUsers, writeUsers };

export function getUserIdFromRequest(req) {
  const account = resolveAccountFromRequest(req);
  return account?.id || null;
}

export function getUserFromRequest(req) {
  const account = resolveAccountFromRequest(req);
  return account ? publicAccount(account) : null;
}

export function getAccountFromRequest(req) {
  return resolveAccountFromRequest(req);
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
  if (existing && !existing.rehydrated && existing.passwordHash) {
    throw new Error("An account with this email already exists");
  }

  let account;
  if (existing?.rehydrated || (existing && !existing.passwordHash)) {
    account = updateAccount(existing.id, {
      name: displayName,
      passwordHash: hashPassword(plainPassword),
      rehydrated: false,
    });
  } else {
    account = createAccount({
      email: normalizedEmail,
      name: displayName,
      passwordHash: hashPassword(plainPassword),
    });
  }

  return sessionForAccount(account);
}

export function login({ email, password, accountBackup }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const plainPassword = String(password || "");

  if (!normalizedEmail || !plainPassword) {
    throw new Error("Email and password are required");
  }

  let account = getAccountByEmail(normalizedEmail);

  // Restore from browser backup when serverless storage was wiped
  if (!account || !account.passwordHash) {
    const restored = openAccountBackup(accountBackup);
    if (restored && restored.email === normalizedEmail && restored.passwordHash) {
      account = saveAccountFromBackup(restored);
    }
  }

  if (!account) {
    throw new Error("Invalid email or password");
  }

  if (account.rehydrated || !account.passwordHash) {
    throw new Error(
      "Could not verify account on this server. Sign up again on this device, or use the same browser where you created the account."
    );
  }

  if (!verifyPassword(plainPassword, account.passwordHash)) {
    throw new Error("Invalid email or password");
  }

  // Ensure this instance has the account for subsequent requests
  account = saveAccountFromBackup(account);

  return sessionForAccount(account);
}
