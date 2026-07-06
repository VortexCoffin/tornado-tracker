import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultSubscription,
  canUseOverlay,
  listOverlaysForTier,
  subscribeToTier,
  OVERLAYS,
} from "./subscriptions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const ACCOUNTS_DIR = join(DATA_DIR, "accounts");
const USERS_FILE = join(DATA_DIR, "users.json");
const ACCOUNTS_INDEX = join(ACCOUNTS_DIR, "index.json");

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

function normalizeAccount(raw) {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    passwordHash: raw.passwordHash,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt,
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
    sentAlertIds: raw.sentAlertIds || [],
  };
}

function saveAccount(account) {
  const normalized = normalizeAccount(account);
  normalized.updatedAt = new Date().toISOString();
  writeFileSync(accountPath(normalized.id), JSON.stringify(normalized, null, 2));

  const index = readIndex();
  if (!index.includes(normalized.id)) {
    index.push(normalized.id);
    writeIndex(index);
  }

  return normalized;
}

function readAccountFile(id) {
  const file = accountPath(id);
  if (!existsSync(file)) return null;
  return normalizeAccount(JSON.parse(readFileSync(file, "utf8")));
}

function migrateLegacyUsers() {
  const legacyUsers = readLegacyUsers();
  if (legacyUsers.length === 0) return;

  for (const legacy of legacyUsers) {
    if (readAccountFile(legacy.id)) continue;
    saveAccount(legacy);
  }

  writeLegacyUsers([]);
}

export function readUsers() {
  migrateLegacyUsers();
  return readIndex()
    .map((id) => readAccountFile(id))
    .filter(Boolean);
}

export function writeUsers(users) {
  for (const user of users) {
    saveAccount(user);
  }
}

export function getAccountById(id) {
  migrateLegacyUsers();
  return readAccountFile(id);
}

export function getAccountByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return readUsers().find((account) => account.email === normalized) || null;
}

export function createAccount({ email, passwordHash, name }) {
  const account = saveAccount({
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

  return account;
}

export function updateAccount(id, updates) {
  const account = getAccountById(id);
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
    unlockedOverlayIds: overlays.filter((item) => item.unlocked).map((item) => item.id),
  };
}

export function setAccountOverlay(id, updates = {}) {
  const account = getAccountById(id);
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

export function changeSubscription(id, tierId) {
  const account = getAccountById(id);
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