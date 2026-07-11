/**
 * Vercel serverless entry — handles /api and /api/* (via rewrite).
 */
import { handleRequest } from "../backend/server.js";

function rebuildUrl(req) {
  // Rewrite: /api/foo/bar?x=1 → /api?path=foo/bar&x=1  (or original /api/foo/bar)
  const raw = req.url || "/api";
  let url;
  try {
    url = new URL(raw, "http://local");
  } catch {
    return raw.startsWith("/api") ? raw : `/api${raw.startsWith("/") ? raw : `/${raw}`}`;
  }

  const pathParam = url.searchParams.get("path") ?? req.query?.path;
  if (pathParam != null && pathParam !== "") {
    const parts = Array.isArray(pathParam) ? pathParam : [pathParam];
    const joined = parts.filter(Boolean).join("/");
    url.searchParams.delete("path");
    const search = url.searchParams.toString();
    return `/api/${joined}${search ? `?${search}` : ""}`;
  }

  if (url.pathname === "/api" || url.pathname === "/api/" || url.pathname === "/api/index") {
    return `/api${url.search}`;
  }

  if (url.pathname.startsWith("/api")) {
    return `${url.pathname}${url.search}`;
  }

  return `/api${url.pathname}${url.search}`;
}

export default async function handler(req, res) {
  req.url = rebuildUrl(req);
  await handleRequest(req, res);
}
