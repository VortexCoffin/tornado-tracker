import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  defaultSubscription,
  canUseOverlay,
  listOverlaysForTier,
  subscribeToTier,
  OVERLAYS,
} from "./subscriptions.js";
import { getDataDir } from "./paths.js";
import { getDb, isDatabaseEnabled } from "./db.js";

const DATA_DIR = getDataDir();
const ACCOUNTS_DIR = join(DATA_DIR, "accounts");
const USERS_FILE = join(DATA_DIR, "users.json");
const ACCOUNTS_INDEX = join(ACCOUNTS_DIR, "index.json");

function memoryStore() {
  if (!globalThis.__ttAccountMem) {
    globalThis.__ttAccountMem = new Map();
  }
  return globalThis.__ttAccountMem;
}

function ensureStorage() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(ACCOUNTS_DIR)) mkdirSync(ACCOUNTS_DIR, { recursive: true });
  if (!existsSync(ACCOUNTS_INDEX)) writeFileSync(ACCOUNTS_INDEX, "[]");
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, "[]");
}

function readIndex() {
  ensureStorage();
  return JSON.parse(readFileSync(ACCOUNTS_INDEX, "utf8"));
}

function writeIndex(index) {
  ensureStorage();
  writeFileSync(ACCOUNTS_INDEX, JSON.stringify(index, null, 2));
}

function accountPath(id) {
  return join(ACCOUNTS_DIR, `${id}.json`);
}

function readLegacyUsers() {
  ensureStorage();
  return JSON.parse(readFileSync(USERS_FILE, "utf8"));
}

function writeLegacyUsers(users) {
  ensureStorage();
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function normalizeAccount(raw) {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    passwordHash: raw.passwordHash ?? raw.password_hash ?? "",
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt:
      raw.updatedAt ||
      raw.updated_at ||
      raw.createdAt ||
      raw.created_at ||
      new Date().toISOString(),
    rehydrated: Boolean(raw.rehydrated),
    subscription: {
      ...defaultSubscription(),
      ...(raw.subscription || {}),
      provider: raw.subscription?.provider ?? null,
      paypalSubscriptionId: raw.subscription?.paypalSubscriptionId ?? null,
    },
    preferences: {
      mapOverlay: "standard",
      showRadar: true,
      showClouds: false,
      ...(raw.preferences || {}),
    },
    notifications: {
      smsEnabled: false,
      inAppEnabled: true,
      browserEnabled: true,
      phoneNumber: "",
      provinces: [],
      alertAreas: [],
      ...(raw.notifications || {}),
    },
    sentAlertIds: raw.sentAlertIds || raw.sent_alert_ids || [],
  };
}

function rowToAccount(row) {
  if (!row) return null;
  return normalizeAccount({
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rehydrated: row.rehydrated,
    subscription: row.subscription,
    preferences: row.preferences,
    notifications: row.notifications,
    sentAlertIds: row.sent_alert_ids,
  });
}

async function dbSaveAccount(account) {
  const sql = await getDb();
  const normalized = normalizeAccount(account);
  normalized.updatedAt = new Date().toISOString();

  await sql`
    INSERT INTO accounts (
      id, email, name, password_hash, created_at, updated_at, rehydrated,
      subscription, preferences, notifications, sent_alert_ids
    ) VALUES (
      ${normalized.id},
      ${normalized.email},
      ${normalized.name},
      ${normalized.passwordHash || ""},
      ${normalized.createdAt},
      ${normalized.updatedAt},
      ${Boolean(normalized.rehydrated)},
      ${sql.json(normalized.subscription)},
      ${sql.json(normalized.preferences)},
      ${sql.json(normalized.notifications)},
      ${sql.json(normalized.sentAlertIds || [])}
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      updated_at = EXCLUDED.updated_at,
      rehydrated = EXCLUDED.rehydrated,
      subscription = EXCLUDED.subscription,
      preferences = EXCLUDED.preferences,
      notifications = EXCLUDED.notifications,
      sent_alert_ids = EXCLUDED.sent_alert_ids
  `;

  memoryStore().set(normalized.id, normalized);
  return normalized;
}

function fileSaveAccount(account) {
  const normalized = normalizeAccount(account);
  normalized.updatedAt = new Date().toISOString();
  try {
    writeFileSync(accountPath(normalized.id), JSON.stringify(normalized, null, 2));
    const index = readIndex();
    if (!index.includes(normalized.id)) {
      index.push(normalized.id);
      writeIndex(index);
    }
  } catch (error) {
    console.warn("Account disk write failed:", error.message);
  }
  memoryStore().set(normalized.id, normalized);
  return normalized;
}

async function saveAccount(account) {
  if (isDatabaseEnabled()) {
    try {
      return await dbSaveAccount(account);
    } catch (error) {
      console.error("Postgres account save failed, falling back to file:", error.message);
      return fileSaveAccount(account);
    }
  }
  return fileSaveAccount(account);
}

function fileReadAccount(id) {
  const mem = memoryStore();
  if (mem.has(id)) return mem.get(id);

  const file = accountPath(id);
  if (!existsSync(file)) return null;
  try {
    const account = normalizeAccount(JSON.parse(readFileSync(file, "utf8")));
    mem.set(id, account);
    return account;
  } catch {
    return null;
  }
}

async function dbReadAccount(id) {
  const mem = memoryStore();
  if (mem.has(id)) return mem.get(id);

  const sql = await getDb();
  const rows = await sql`SELECT * FROM accounts WHERE id = ${id} LIMIT 1`;
  const account = rowToAccount(rows[0]);
  if (account) mem.set(id, account);
  return account;
}

function migrateLegacyUsers() {
  if (isDatabaseEnabled()) return;
  const legacyUsers = readLegacyUsers();
  if (legacyUsers.length === 0) return;

  for (const legacy of legacyUsers) {
    if (fileReadAccount(legacy.id)) continue;
    fileSaveAccount(legacy);
  }

  writeLegacyUsers([]);
}

export async function readUsers() {
  if (isDatabaseEnabled()) {
    const sql = await getDb();
    const rows = await sql`SELECT * FROM accounts ORDER BY created_at ASC`;
    return rows.map(rowToAccount);
  }

  migrateLegacyUsers();
  return readIndex()
    .map((id) => fileReadAccount(id))
    .filter(Boolean);
}

export async function writeUsers(users) {
  for (const user of users) {
    await saveAccount(user);
  }
}

export async function getAccountById(id) {
  if (!id) return null;

  if (isDatabaseEnabled()) {
    try {
      return await dbReadAccount(id);
    } catch (error) {
      console.error("Postgres getAccountById failed:", error.message);
      return fileReadAccount(id);
    }
  }

  migrateLegacyUsers();
  return fileReadAccount(id);
}

export async function getAccountByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  for (const account of memoryStore().values()) {
    if (account.email === normalized) return account;
  }

  if (isDatabaseEnabled()) {
    try {
      const sql = await getDb();
      const rows =
        await sql`SELECT * FROM accounts WHERE lower(email) = ${normalized} LIMIT 1`;
      const account = rowToAccount(rows[0]);
      if (account) memoryStore().set(account.id, account);
      return account;
    } catch (error) {
      console.error("Postgres getAccountByEmail failed:", error.message);
    }
  }

  const users = await readUsers();
  return users.find((account) => account.email === normalized) || null;
}

export async function rehydrateAccountFromToken(payload) {
  if (!payload?.sub || !payload?.email) return null;

  const existing = await getAccountById(payload.sub);
  if (existing) return existing;

  const email = String(payload.email).trim().toLowerCase();
  const byEmail = await getAccountByEmail(email);
  if (byEmail) return byEmail;

  return saveAccount({
    id: payload.sub,
    email,
    name: payload.name || email.split("@")[0] || "User",
    passwordHash: "",
    createdAt: new Date().toISOString(),
    rehydrated: true,
    subscription: defaultSubscription(),
    preferences: {
      mapOverlay: "standard",
      showRadar: true,
      showClouds: false,
    },
    notifications: {
      smsEnabled: false,
      inAppEnabled: true,
      browserEnabled: true,
      phoneNumber: "",
      provinces: [],
      alertAreas: [],
    },
    sentAlertIds: [],
  });
}

export async function saveAccountFromBackup(raw) {
  if (!raw?.id || !raw?.email) {
    throw new Error("Invalid account backup");
  }

  return saveAccount({
    id: raw.id,
    email: String(raw.email).trim().toLowerCase(),
    name: raw.name || "User",
    passwordHash: raw.passwordHash || "",
    createdAt: raw.createdAt || new Date().toISOString(),
    rehydrated: false,
    subscription: raw.subscription || defaultSubscription(),
    preferences: raw.preferences || {
      mapOverlay: "standard",
      showRadar: true,
      showClouds: false,
    },
    notifications: raw.notifications || {
      smsEnabled: false,
      inAppEnabled: true,
      browserEnabled: true,
      phoneNumber: "",
      provinces: [],
      alertAreas: [],
    },
    sentAlertIds: raw.sentAlertIds || [],
  });
}

export async function createAccount({ email, passwordHash, name }) {
  return saveAccount({
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
    subscription: defaultSubscription(),
    preferences: { mapOverlay: "standard" },
    notifications: {
      smsEnabled: false,
      inAppEnabled: true,
      browserEnabled: true,
      phoneNumber: "",
      provinces: [],
    },
    sentAlertIds: [],
  });
}

export async function updateAccount(id, updates) {
  const account = await getAccountById(id);
  if (!account) throw new Error("Account not found");

  const next = {
    ...account,
    ...updates,
    preferences: { ...account.preferences, ...(updates.preferences || {}) },
    notifications: { ...account.notifications, ...(updates.notifications || {}) },
    subscription: updates.subscription
      ? { ...account.subscription, ...updates.subscription }
      : account.subscription,
  };

  if (updates.rehydrated === false) {
    next.rehydrated = false;
  }
  if (updates.sentAlertIds) {
    next.sentAlertIds = updates.sentAlertIds;
  }

  return saveAccount(next);
}

export function publicAccount(account) {
  const tier = account.subscription?.tier || "free";
  const overlays = listOverlaysForTier(tier);

  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
    subscription: account.subscription,
    preferences: account.preferences,
    overlays,
    unlockedOverlayIds: overlays
      .filter((item) => item.unlocked)
      .map((item) => item.id),
  };
}

export async function setAccountOverlay(id, updates = {}) {
  const account = await getAccountById(id);
  if (!account) throw new Error("Account not found");

  const tier = account.subscription?.tier || "free";
  const nextPreferences = { ...account.preferences };

  if (updates.overlayId !== undefined) {
    if (!OVERLAYS[updates.overlayId]) throw new Error("Unknown map overlay");
    if (!canUseOverlay(tier, updates.overlayId)) {
      throw new Error("Upgrade your subscription to use this overlay");
    }
    if (OVERLAYS[updates.overlayId].type !== "base") {
      throw new Error("Choose a base map layer");
    }
    nextPreferences.mapOverlay = updates.overlayId;
  }

  if (updates.showRadar !== undefined) {
    if (updates.showRadar && !canUseOverlay(tier, "radar")) {
      throw new Error("Upgrade to Pro to enable radar overlay");
    }
    nextPreferences.showRadar = Boolean(updates.showRadar);
  }

  if (updates.showClouds !== undefined) {
    if (updates.showClouds && !canUseOverlay(tier, "clouds")) {
      throw new Error("Upgrade to Pro to enable cloud overlay");
    }
    nextPreferences.showClouds = Boolean(updates.showClouds);
  }

  return updateAccount(id, { preferences: nextPreferences });
}

export async function changeSubscription(id, tierId) {
  const account = await getAccountById(id);
  if (!account) throw new Error("Account not found");

  const subscription = subscribeToTier(account.subscription?.tier, tierId);
  const allowedOverlays = listOverlaysForTier(subscription.tier)
    .filter((item) => item.unlocked && item.type === "base")
    .map((item) => item.id);

  const mapOverlay = allowedOverlays.includes(account.preferences?.mapOverlay)
    ? account.preferences.mapOverlay
    : "standard";

  return updateAccount(id, {
    subscription,
    preferences: { ...account.preferences, mapOverlay },
  });
}
