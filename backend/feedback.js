import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./paths.js";
import { getDb, isDatabaseEnabled } from "./db.js";

const DATA_DIR = getDataDir();
const FEEDBACK_FILE = join(DATA_DIR, "feedback.json");
const MAX_COMMENT_LEN = 1000;
const MAX_NAME_LEN = 60;
const MAX_ITEMS = 200;

function memoryStore() {
  if (!globalThis.__ttFeedbackMem) {
    globalThis.__ttFeedbackMem = null;
  }
  return globalThis.__ttFeedbackMem;
}

function setMemory(items) {
  globalThis.__ttFeedbackMem = items;
}

function ensureFile() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FEEDBACK_FILE)) writeFileSync(FEEDBACK_FILE, "[]");
}

function publicItem(item) {
  return {
    id: item.id,
    name: item.name,
    rating: item.rating,
    comment: item.comment,
    createdAt: item.createdAt || item.created_at,
  };
}

function fileReadAll() {
  const mem = memoryStore();
  if (Array.isArray(mem)) return mem;

  try {
    ensureFile();
    const items = JSON.parse(readFileSync(FEEDBACK_FILE, "utf8"));
    const list = Array.isArray(items) ? items : [];
    setMemory(list);
    return list;
  } catch {
    setMemory([]);
    return [];
  }
}

function fileWriteAll(items) {
  const trimmed = items.slice(0, MAX_ITEMS);
  setMemory(trimmed);
  try {
    ensureFile();
    writeFileSync(FEEDBACK_FILE, JSON.stringify(trimmed, null, 2));
  } catch (error) {
    console.warn("Feedback disk write failed:", error.message);
  }
  return trimmed;
}

async function dbList({ rating } = {}) {
  const sql = await getDb();
  let rows;
  if (rating === "positive" || rating === "negative") {
    rows = await sql`
      SELECT * FROM feedback
      WHERE rating = ${rating}
      ORDER BY created_at DESC
      LIMIT ${MAX_ITEMS}
    `;
  } else {
    rows = await sql`
      SELECT * FROM feedback
      ORDER BY created_at DESC
      LIMIT ${MAX_ITEMS}
    `;
  }
  return rows.map((row) =>
    publicItem({
      id: row.id,
      name: row.name,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
    })
  );
}

async function dbStats() {
  const sql = await getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE rating = 'positive')::int AS positive,
      COUNT(*) FILTER (WHERE rating = 'negative')::int AS negative
    FROM feedback
  `;
  return {
    total: rows[0]?.total || 0,
    positive: rows[0]?.positive || 0,
    negative: rows[0]?.negative || 0,
  };
}

export async function listFeedback({ rating } = {}) {
  if (isDatabaseEnabled()) {
    try {
      return await dbList({ rating });
    } catch (error) {
      console.error("Postgres feedback list failed:", error.message);
    }
  }

  let items = fileReadAll();
  if (rating === "positive" || rating === "negative") {
    items = items.filter((item) => item.rating === rating);
  }
  return items.map(publicItem);
}

export async function feedbackStats() {
  if (isDatabaseEnabled()) {
    try {
      return await dbStats();
    } catch (error) {
      console.error("Postgres feedback stats failed:", error.message);
    }
  }

  const items = fileReadAll();
  let positive = 0;
  let negative = 0;
  for (const item of items) {
    if (item.rating === "positive") positive += 1;
    else if (item.rating === "negative") negative += 1;
  }
  return { total: items.length, positive, negative };
}

export async function createFeedback({ name, rating, comment }) {
  const cleanName =
    String(name || "Anonymous").trim().slice(0, MAX_NAME_LEN) || "Anonymous";
  const cleanRating = String(rating || "").toLowerCase();
  const cleanComment = String(comment || "").trim().slice(0, MAX_COMMENT_LEN);

  if (cleanRating !== "positive" && cleanRating !== "negative") {
    throw new Error("Choose a positive or negative rating");
  }
  if (cleanComment.length < 3) {
    throw new Error("Comment must be at least 3 characters");
  }
  if (cleanComment.length > MAX_COMMENT_LEN) {
    throw new Error(`Comment must be under ${MAX_COMMENT_LEN} characters`);
  }

  const item = {
    id: crypto.randomUUID(),
    name: cleanName,
    rating: cleanRating,
    comment: cleanComment,
    createdAt: new Date().toISOString(),
  };

  if (isDatabaseEnabled()) {
    try {
      const sql = await getDb();
      await sql`
        INSERT INTO feedback (id, name, rating, comment, created_at)
        VALUES (
          ${item.id},
          ${item.name},
          ${item.rating},
          ${item.comment},
          ${item.createdAt}
        )
      `;
      return publicItem(item);
    } catch (error) {
      console.error("Postgres feedback create failed:", error.message);
    }
  }

  const items = [item, ...fileReadAll()];
  fileWriteAll(items);
  return publicItem(item);
}
