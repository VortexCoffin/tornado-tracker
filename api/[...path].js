/**
 * Vercel serverless catch-all for /api/*
 * Routes into the same handler used by the local Node server.
 */
import { handleRequest } from "../backend/server.js";

function normalizeUrl(req) {
  let url = req.url || "/";

  // Catch-all params: /api/auth/login → query.path = ["auth","login"]
  if (req.query?.path) {
    const parts = Array.isArray(req.query.path)
      ? req.query.path
      : [req.query.path];
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    url = `/api/${parts.filter(Boolean).join("/")}${search}`;
  } else if (!url.startsWith("/api")) {
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    const pathPart = url.split("?")[0].replace(/^\//, "");
    url = `/api/${pathPart}${search}`;
  }

  return url;
}

export default async function handler(req, res) {
  req.url = normalizeUrl(req);
  await handleRequest(req, res);
}
