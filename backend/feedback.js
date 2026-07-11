import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./paths.js";

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

function readAll() {
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

function writeAll(items) {
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

function publicItem(item) {
  return {
    id: item.id,
    name: item.name,
    rating: item.rating,
    comment: item.comment,
    createdAt: item.createdAt,
  };
}

export function listFeedback({ rating } = {}) {
  let items = readAll();
  if (rating === "positive" || rating === "negative") {
    items = items.filter((item) => item.rating === rating);
  }
  return items.map(publicItem);
}

export function feedbackStats() {
  const items = readAll();
  let positive = 0;
  let negative = 0;
  for (const item of items) {
    if (item.rating === "positive") positive += 1;
    else if (item.rating === "negative") negative += 1;
  }
  return {
    total: items.length,
    positive,
    negative,
  };
}

export function createFeedback({ name, rating, comment }) {
  const cleanName = String(name || "Anonymous").trim().slice(0, MAX_NAME_LEN) || "Anonymous";
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

  const items = [item, ...readAll()];
  writeAll(items);
  return publicItem(item);
}
