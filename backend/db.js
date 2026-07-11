import "./env.js";
import postgres from "postgres";

let sql = null;
let schemaReady = false;

export function isDatabaseEnabled() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabaseMode() {
  return isDatabaseEnabled() ? "postgres" : "file";
}

async function ensureSchema(client) {
  if (schemaReady) return;

  await client`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rehydrated BOOLEAN NOT NULL DEFAULT FALSE,
      subscription JSONB NOT NULL DEFAULT '{}'::jsonb,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
      sent_alert_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rating TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS notification_inbox (
      user_id TEXT PRIMARY KEY,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await client`CREATE INDEX IF NOT EXISTS accounts_email_idx ON accounts (email)`;
  await client`CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC)`;
  await client`CREATE INDEX IF NOT EXISTS feedback_rating_idx ON feedback (rating)`;

  schemaReady = true;
}

/**
 * Shared Postgres client (Neon / Vercel Postgres / Supabase / local).
 * Returns null when DATABASE_URL is not set (file fallback).
 */
export async function getDb() {
  if (!isDatabaseEnabled()) return null;

  if (!sql) {
    const url = process.env.DATABASE_URL.trim();
    const useSsl =
      process.env.DATABASE_SSL === "false"
        ? false
        : process.env.DATABASE_SSL === "true"
          ? "require"
          : url.includes("localhost") || url.includes("127.0.0.1")
            ? false
            : "require";

    sql = postgres(url, {
      ssl: useSsl,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }

  await ensureSchema(sql);
  return sql;
}

export async function dbHealth() {
  if (!isDatabaseEnabled()) {
    return { configured: false, mode: "file", ok: true };
  }

  try {
    const client = await getDb();
    await client`SELECT 1`;
    return { configured: true, mode: "postgres", ok: true };
  } catch (error) {
    return {
      configured: true,
      mode: "postgres",
      ok: false,
      error: error.message,
    };
  }
}
