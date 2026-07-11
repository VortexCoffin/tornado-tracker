import "./env.js";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  readUsers,
  getAccountById,
  updateAccount,
} from "./accounts.js";
import { isTornadoOnGround, matchesAlertArea } from "./alerts.js";
import { getDataDir } from "./paths.js";
import { getDb, isDatabaseEnabled } from "./db.js";

const DATA_DIR = getDataDir();
const INBOX_FILE = join(DATA_DIR, "notifications.json");

function twilioConfig() {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_PHONE_NUMBER,
  };
}

function ensureInboxFile() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(INBOX_FILE)) writeFileSync(INBOX_FILE, "{}");
}

function fileReadInbox() {
  ensureInboxFile();
  return JSON.parse(readFileSync(INBOX_FILE, "utf8"));
}

function fileWriteInbox(inbox) {
  ensureInboxFile();
  writeFileSync(INBOX_FILE, JSON.stringify(inbox, null, 2));
}

async function readUserItems(userId) {
  if (isDatabaseEnabled()) {
    try {
      const sql = await getDb();
      const rows =
        await sql`SELECT items FROM notification_inbox WHERE user_id = ${userId} LIMIT 1`;
      const items = rows[0]?.items;
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error("Postgres inbox read failed:", error.message);
    }
  }

  const inbox = fileReadInbox();
  return inbox[userId] || [];
}

async function writeUserItems(userId, items) {
  if (isDatabaseEnabled()) {
    try {
      const sql = await getDb();
      await sql`
        INSERT INTO notification_inbox (user_id, items, updated_at)
        VALUES (${userId}, ${sql.json(items)}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          items = EXCLUDED.items,
          updated_at = NOW()
      `;
      return;
    } catch (error) {
      console.error("Postgres inbox write failed:", error.message);
    }
  }

  const inbox = fileReadInbox();
  inbox[userId] = items;
  fileWriteInbox(inbox);
}

export function classifyAlert(alert) {
  const name = (alert.alertName || "").toLowerCase();
  if (!name.includes("tornado")) return null;
  if (isTornadoOnGround(alert)) return "tornado_on_ground";
  if (alert.alertType === "warning") return "tornado_warning";
  if (alert.alertType === "watch") return "tornado_watch";
  return "tornado_alert";
}

export function defaultPreferences() {
  return {
    smsEnabled: false,
    inAppEnabled: true,
    browserEnabled: true,
    phoneNumber: "",
    provinces: [],
    alertAreas: [],
  };
}

function normalizeAlertAreas(areas) {
  if (!Array.isArray(areas)) return [];
  return areas
    .map((area) => ({
      location: String(area.location || "").trim(),
      province: String(area.province || "").trim().toUpperCase(),
    }))
    .filter((area) => area.location);
}

export function getPreferences(user) {
  return { ...defaultPreferences(), ...(user.notifications || {}) };
}

export async function updatePreferences(userId, updates) {
  const account = await getAccountById(userId);
  if (!account) throw new Error("User not found");

  const current = getPreferences(account);
  const phoneNumber =
    updates.phoneNumber !== undefined
      ? String(updates.phoneNumber).trim()
      : current.phoneNumber;

  if (
    updates.smsEnabled &&
    phoneNumber &&
    !/^\+[1-9]\d{7,14}$/.test(phoneNumber)
  ) {
    throw new Error("Phone number must be in E.164 format, e.g. +15551234567");
  }

  const alertAreas =
    updates.alertAreas !== undefined
      ? normalizeAlertAreas(updates.alertAreas)
      : current.alertAreas;

  const notifications = {
    ...current,
    ...updates,
    phoneNumber,
    alertAreas,
  };

  const updated = await updateAccount(userId, {
    notifications,
    sentAlertIds: account.sentAlertIds || [],
  });

  return getPreferences(updated);
}

export async function getInbox(userId) {
  const items = await readUserItems(userId);
  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function addInAppNotification(userId, payload) {
  const items = await readUserItems(userId);
  const entry = {
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
    ...payload,
  };
  const next = [entry, ...items].slice(0, 100);
  await writeUserItems(userId, next);
  return entry;
}

export async function markNotificationsRead(userId, notificationId) {
  const items = await readUserItems(userId);
  const next = items.map((item) => {
    if (!notificationId || item.id === notificationId) {
      return { ...item, read: true };
    }
    return item;
  });
  await writeUserItems(userId, next);
  return next;
}

function buildMessage(alert, type) {
  const prefixes = {
    tornado_on_ground: "TORNADO ON GROUND",
    tornado_warning: "TORNADO WARNING",
    tornado_watch: "TORNADO WATCH",
    tornado_alert: "TORNADO ALERT",
  };
  const prefix = prefixes[type] || "TORNADO ALERT";

  return `${prefix}: ${alert.location}, ${alert.province}. ${alert.alertName}. ${alert.summary}`.slice(
    0,
    320
  );
}

function matchesProvinceFilter(alert, provinces) {
  if (!provinces || provinces.length === 0) return true;
  return provinces.includes(alert.province);
}

async function sendSms(to, body) {
  const { sid, token, from } = twilioConfig();
  if (!sid || !token || !from) {
    console.warn("SMS skipped: Twilio is not configured in backend/.env");
    return { sent: false, reason: "twilio_not_configured" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: body,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio error ${response.status}: ${errorText}`);
  }

  return { sent: true };
}

async function markAlertSent(userId, alertId) {
  const account = await getAccountById(userId);
  if (!account) return;

  const sent = new Set(account.sentAlertIds || []);
  sent.add(alertId);
  await updateAccount(userId, {
    sentAlertIds: [...sent].slice(-500),
  });
}

export async function processAlertsForNotifications(alerts) {
  const users = await readUsers();
  const notifyable = alerts
    .map((alert) => ({ alert, type: classifyAlert(alert) }))
    .filter((entry) => entry.type);

  const results = [];

  for (const user of users) {
    const prefs = getPreferences(user);
    if (!prefs.inAppEnabled && !prefs.smsEnabled) continue;

    const sent = new Set(user.sentAlertIds || []);

    for (const { alert, type } of notifyable) {
      if (sent.has(alert.id)) continue;
      const hasAreaFilter = prefs.alertAreas?.length > 0;
      if (!hasAreaFilter && !matchesProvinceFilter(alert, prefs.provinces)) {
        continue;
      }
      if (!matchesAlertArea(alert, prefs.alertAreas)) continue;

      const titles = {
        tornado_on_ground: "Tornado on the ground",
        tornado_warning: "Tornado Warning",
        tornado_watch: "Tornado Watch",
        tornado_alert: "Tornado Alert",
      };
      const title = titles[type] || "Tornado Alert";
      const body = buildMessage(alert, type);
      const severity =
        type === "tornado_on_ground"
          ? "critical"
          : type === "tornado_warning"
            ? "high"
            : "medium";

      try {
        if (prefs.inAppEnabled) {
          await addInAppNotification(user.id, {
            alertId: alert.id,
            type,
            title,
            body,
            location: alert.location,
            province: alert.province,
            alertName: alert.alertName,
            severity,
          });
        }

        if (prefs.smsEnabled && prefs.phoneNumber) {
          await sendSms(prefs.phoneNumber, body);
        }

        await markAlertSent(user.id, alert.id);
        results.push({ userId: user.id, alertId: alert.id, type });
      } catch (error) {
        console.error(`Notification failed for user ${user.id}:`, error.message);
      }
    }
  }

  return results;
}

export function smsConfigured() {
  const { sid, token, from } = twilioConfig();
  return Boolean(sid && token && from);
}
