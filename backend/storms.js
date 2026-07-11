import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { getAccountById } from "./accounts.js";
import { getDataDir } from "./paths.js";

const DATA_DIR = join(getDataDir(), "storms");
const POSTS_FILE = join(DATA_DIR, "posts.json");
const REPORTS_FILE = join(DATA_DIR, "reports.json");
const UPLOADS_DIR = join(DATA_DIR, "uploads");
const REPORT_THRESHOLD = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function ensureStorage() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!existsSync(POSTS_FILE)) writeFileSync(POSTS_FILE, "[]");
  if (!existsSync(REPORTS_FILE)) writeFileSync(REPORTS_FILE, "[]");
}

function readReports() {
  ensureStorage();
  return JSON.parse(readFileSync(REPORTS_FILE, "utf8"));
}

function writeReports(reports) {
  ensureStorage();
  writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
}

function readPosts() {
  ensureStorage();
  return JSON.parse(readFileSync(POSTS_FILE, "utf8"));
}

function writePosts(posts) {
  ensureStorage();
  writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

async function publicAuthor(userId) {
  const account = await getAccountById(userId);
  if (!account) return { id: userId, name: "Unknown user" };
  return { id: account.id, name: account.name };
}

async function publicPost(post, userId) {
  const author = await publicAuthor(post.userId);
  const comments = await Promise.all(
    (post.comments || []).map(async (comment) => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      author: await publicAuthor(comment.userId),
    }))
  );

  return {
    id: post.id,
    caption: post.caption,
    location: post.location || null,
    province: post.province || null,
    imageUrl: `/api/storms/posts/${post.id}/image`,
    createdAt: post.createdAt,
    author,
    likeCount: post.likes.length,
    commentCount: post.comments.length,
    likedByMe: userId ? post.likes.includes(userId) : false,
    canDelete: userId ? post.userId === userId : false,
    comments,
  };
}

function saveImageFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Image must be a base64 data URL");

  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be smaller than 2 MB");
  }

  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  return { buffer, ext, mime };
}

export async function listPosts(userId) {
  const posts = readPosts()
    .filter((post) => !post.hidden)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  return Promise.all(posts.map((post) => publicPost(post, userId)));
}

export async function getPost(postId, userId) {
  const post = readPosts().find((entry) => entry.id === postId);
  if (!post) throw new Error("Post not found");
  return publicPost(post, userId);
}

export async function createPost(userId, { caption, imageData, location, province }) {
  const account = await getAccountById(userId);
  if (!account) throw new Error("Account not found");

  const text = String(caption || "").trim();
  if (!text) throw new Error("Caption is required");
  if (!imageData) throw new Error("Photo is required");
  const place = String(location || "").trim();
  const region = String(province || "").trim().toUpperCase();

  const { buffer, ext, mime } = saveImageFromDataUrl(imageData);
  const id = crypto.randomUUID();
  const imagePath = join(UPLOADS_DIR, `${id}${ext}`);
  writeFileSync(imagePath, buffer);

  const post = {
    id,
    userId,
    caption: text,
    location: place || null,
    province: region || null,
    imageFile: `${id}${ext}`,
    mime,
    createdAt: new Date().toISOString(),
    likes: [],
    comments: [],
  };

  const posts = readPosts();
  posts.unshift(post);
  writePosts(posts);
  return publicPost(post, userId); // async
}

export function getPostImage(postId) {
  const post = readPosts().find((entry) => entry.id === postId);
  if (!post) throw new Error("Post not found");

  const imagePath = join(UPLOADS_DIR, post.imageFile);
  if (!existsSync(imagePath)) throw new Error("Image not found");

  return {
    path: imagePath,
    mime: post.mime || "image/jpeg",
  };
}

export async function toggleLike(postId, userId) {
  const posts = readPosts();
  const index = posts.findIndex((entry) => entry.id === postId);
  if (index === -1) throw new Error("Post not found");

  const likes = new Set(posts[index].likes || []);
  if (likes.has(userId)) likes.delete(userId);
  else likes.add(userId);

  posts[index].likes = [...likes];
  writePosts(posts);
  return publicPost(posts[index], userId);
}

export function deletePost(postId, userId) {
  const posts = readPosts();
  const index = posts.findIndex((entry) => entry.id === postId);
  if (index === -1) throw new Error("Post not found");
  if (posts[index].userId !== userId) {
    throw new Error("You can only delete your own posts");
  }

  const imagePath = join(UPLOADS_DIR, posts[index].imageFile);
  if (existsSync(imagePath)) {
    unlinkSync(imagePath);
  }

  posts.splice(index, 1);
  writePosts(posts);
  return { id: postId };
}

export function reportPost(postId, userId, reason) {
  const posts = readPosts();
  const index = posts.findIndex((entry) => entry.id === postId);
  if (index === -1) throw new Error("Post not found");

  const reports = readReports();
  const already = reports.some(
    (entry) => entry.postId === postId && entry.userId === userId
  );
  if (already) throw new Error("You already reported this post");

  reports.push({
    id: crypto.randomUUID(),
    postId,
    userId,
    reason: String(reason || "inappropriate").trim().slice(0, 200),
    createdAt: new Date().toISOString(),
  });
  writeReports(reports);

  const reportCount = reports.filter((entry) => entry.postId === postId).length;
  if (reportCount >= REPORT_THRESHOLD) {
    posts[index].hidden = true;
    writePosts(posts);
  }

  return { reported: true, reportCount };
}

export async function addComment(postId, userId, text) {
  const posts = readPosts();
  const index = posts.findIndex((entry) => entry.id === postId);
  if (index === -1) throw new Error("Post not found");

  const commentText = String(text || "").trim();
  if (!commentText) throw new Error("Comment cannot be empty");

  const comment = {
    id: crypto.randomUUID(),
    userId,
    text: commentText,
    createdAt: new Date().toISOString(),
  };

  posts[index].comments.push(comment);
  writePosts(posts);
  return publicPost(posts[index], userId);
}