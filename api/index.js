/**
 * Vercel serverless entry for all /api/* routes.
 * Rewrites in vercel.json send /api/* here while preserving the path in req.url.
 */
import { handleRequest } from "../backend/server.js";

export default async function handler(req, res) {
  // Ensure path always starts with /api (rewrite edge cases)
  if (req.url && !req.url.startsWith("/api")) {
    const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const path = req.url.split("?")[0].replace(/^\//, "");
    req.url = path ? `/api/${path}${search}` : `/api${search}`;
  }

  // Prefer original path when platform strips it
  const original =
    req.headers["x-invoke-path"] ||
    req.headers["x-forwarded-uri"] ||
    req.headers["x-vercel-original-url"];
  if (original && typeof original === "string") {
    try {
      const pathOnly = original.startsWith("http")
        ? new URL(original).pathname + new URL(original).search
        : original;
      if (pathOnly.startsWith("/api")) {
        req.url = pathOnly;
      }
    } catch {
      /* keep req.url */
    }
  }

  await handleRequest(req, res);
}
