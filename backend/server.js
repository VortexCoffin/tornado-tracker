import "./env.js";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import {
  signup,
  login,
  getUserFromRequest,
  getUserIdFromRequest,
} from "./auth.js";
import {
  getAccountById,
  publicAccount,
  setAccountOverlay,
} from "./accounts.js";
import {
  getPayPalConfig,
  createPayPalSubscription,
  completePayPalSubscription,
  downgradeToFree,
  paypalConfigured,
} from "./paypal.js";
import { listPlans, listOverlaysForTier } from "./subscriptions.js";
import {
  processAlertsForNotifications,
  getInbox,
  markNotificationsRead,
  getPreferences,
  updatePreferences,
  smsConfigured,
} from "./notifications.js";
import { getPollIntervalMs } from "./alerts.js";
import { getPastTornadoes } from "./past-tornadoes.js";
import {
  listPosts,
  createPost,
  getPostImage,
  toggleLike,
  addComment,
  deletePost,
  reportPost,
} from "./storms.js";
import { getCurrentWeather } from "./weather.js";
import { listFeedback, createFeedback, feedbackStats } from "./feedback.js";
import { isServerless } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, "..", "frontend", "dist");
const PORT = Number(process.env.PORT) || 5000;
const SERVERLESS = isServerless();
const CACHE_TTL_MS = 3 * 60 * 1000;
const ECCC_ALERTS_URL =
  "https://api.weather.gc.ca/collections/weather-alerts/items?f=json&lang=en-CA&limit=500";
const TORNADO_KEYWORDS = ["tornado", "severe thunderstorm"];

let notifyPollTimer = null;

let cache = {
  alerts: [],
  fetchedAt: null,
  expiresAt: 0,
};

function sendJson(res, status, body, req) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(payload);
}

async function readJsonBody(req) {
  // Vercel may already parse / buffer the body before our handler runs
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON body");
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function polygonCentroid(coordinates) {
  const ring = coordinates[0];
  const lng = ring.reduce((sum, [x]) => sum + x, 0) / ring.length;
  const lat = ring.reduce((sum, [, y]) => sum + y, 0) / ring.length;
  return { lat, lng };
}

function isTornadoRelated(alert) {
  const name = (alert.alert_name_en || "").toLowerCase();
  return TORNADO_KEYWORDS.some((keyword) => name.includes(keyword));
}

function normalizeAlert(feature) {
  const props = feature.properties;
  const centroid = feature.geometry?.coordinates
    ? polygonCentroid(feature.geometry.coordinates)
    : null;

  return {
    id: props.id,
    alertCode: props.alert_code,
    alertType: props.alert_type,
    alertName: props.alert_name_en,
    shortName: props.alert_short_name_en,
    location: props.feature_name_en,
    province: props.province,
    status: props.status_en,
    riskColour: props.risk_colour_en,
    impact: props.impact_en,
    confidence: props.confidence_en,
    publishedAt: props.publication_datetime,
    expiresAt: props.expiration_datetime,
    validUntil: props.event_end_datetime,
    summary: (props.alert_text_en || "").split("\n\n")[0],
    details: props.alert_text_en,
    centroid,
    geometry: feature.geometry,
  };
}

function buildStats(alerts) {
  const byProvince = {};
  const byType = { warning: 0, watch: 0, other: 0 };

  for (const alert of alerts) {
    byProvince[alert.province] = (byProvince[alert.province] || 0) + 1;
    if (alert.alertType === "warning") byType.warning += 1;
    else if (alert.alertType === "watch") byType.watch += 1;
    else byType.other += 1;
  }

  return {
    total: alerts.length,
    warnings: byType.warning,
    watches: byType.watch,
    byProvince,
  };
}

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function tryServeStatic(req, res, url) {
  if (SERVERLESS) return false;
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (!existsSync(FRONTEND_DIST)) return false;
  if (url.pathname.startsWith("/api/")) return false;

  let filePath = join(
    FRONTEND_DIST,
    url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)
  );

  if (!filePath.startsWith(FRONTEND_DIST)) return false;

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(FRONTEND_DIST, "index.html");
  }

  if (!existsSync(filePath)) return false;

  const mime = STATIC_TYPES[extname(filePath)] || "application/octet-stream";
  const buffer = readFileSync(filePath);
  sendBinary(res, 200, buffer, mime, req);
  return true;
}

function sendBinary(res, status, buffer, contentType, req) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": req.headers.origin || "*",
    "Cache-Control": "public, max-age=3600",
  });
  res.end(buffer);
}

async function fetchAlertsFromSource() {
  const response = await fetch(ECCC_ALERTS_URL);
  if (!response.ok) {
    throw new Error(`Environment Canada API returned ${response.status}`);
  }

  const data = await response.json();
  return (data.features || [])
    .filter((feature) => isTornadoRelated(feature.properties))
    .map(normalizeAlert)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}

async function fetchAllTornadoAlerts() {
  const response = await fetch(ECCC_ALERTS_URL);
  if (!response.ok) {
    throw new Error(`Environment Canada API returned ${response.status}`);
  }

  const data = await response.json();
  return (data.features || [])
    .map(normalizeAlert)
    .filter((alert) => (alert.alertName || "").toLowerCase().includes("tornado"))
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}

function scheduleNotificationPoll(alerts = []) {
  if (notifyPollTimer) clearTimeout(notifyPollTimer);
  const intervalMs = getPollIntervalMs(alerts);
  notifyPollTimer = setTimeout(runNotificationCheck, intervalMs);
}

async function runNotificationCheck() {
  let alerts = [];
  try {
    alerts = await fetchAllTornadoAlerts();
    const results = await processAlertsForNotifications(alerts);
    if (results.length > 0) {
      console.log(`Sent ${results.length} tornado notification(s)`);
    }
  } catch (error) {
    console.error("Notification check failed:", error.message);
  } finally {
    scheduleNotificationPoll(alerts);
  }
}

async function getAlerts({ forceRefresh = false } = {}) {
  const now = Date.now();
  const cacheValid = cache.fetchedAt && now < cache.expiresAt;

  if (!forceRefresh && cacheValid) {
    return { alerts: cache.alerts, fetchedAt: cache.fetchedAt, fromCache: true };
  }

  try {
    const alerts = await fetchAlertsFromSource();
    const fetchedAt = new Date().toISOString();

    cache = {
      alerts,
      fetchedAt,
      expiresAt: now + CACHE_TTL_MS,
    };

    return { alerts, fetchedAt, fromCache: false };
  } catch (error) {
    if (cache.fetchedAt) {
      return {
        alerts: cache.alerts,
        fetchedAt: cache.fetchedAt,
        fromCache: true,
        stale: true,
      };
    }
    throw error;
  }
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/health") {
      sendJson(
        res,
        200,
        {
          status: "ok",
          service: "Canada Tornado Tracker",
          smsConfigured: smsConfigured(),
          cacheAgeMs: cache.fetchedAt
            ? Date.now() - new Date(cache.fetchedAt).getTime()
            : null,
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/auth/signup" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = signup(body);
      sendJson(res, 201, result, req);
      return;
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = login(body);
      sendJson(res, 200, result, req);
      return;
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = getUserFromRequest(req);
      if (!user) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      sendJson(res, 200, { user }, req);
      return;
    }

    if (url.pathname === "/api/account" && req.method === "GET") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const account = getAccountById(userId);
      if (!account) {
        sendJson(res, 404, { error: "Account not found" }, req);
        return;
      }
      sendJson(res, 200, { account: publicAccount(account) }, req);
      return;
    }

    if (url.pathname === "/api/plans" && req.method === "GET") {
      sendJson(res, 200, { plans: listPlans() }, req);
      return;
    }

    if (url.pathname === "/api/overlays" && req.method === "GET") {
      const user = getUserFromRequest(req);
      const tier = user?.subscription?.tier || url.searchParams.get("tier") || "free";
      sendJson(
        res,
        200,
        {
          tier,
          overlays: listOverlaysForTier(tier),
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/account/overlay" && req.method === "PUT") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const body = await readJsonBody(req);
      const account = setAccountOverlay(userId, body.overlayId);
      sendJson(res, 200, { account: publicAccount(account) }, req);
      return;
    }

    if (url.pathname === "/api/paypal/config" && req.method === "GET") {
      sendJson(res, 200, getPayPalConfig(), req);
      return;
    }

    if (url.pathname === "/api/subscription/subscribe" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const body = await readJsonBody(req);
      if (body.tier !== "free") {
        sendJson(
          res,
          400,
          { error: "Paid plans require PayPal checkout" },
          req
        );
        return;
      }
      const account = await downgradeToFree(userId);
      sendJson(res, 200, { account: publicAccount(account) }, req);
      return;
    }

    if (url.pathname === "/api/subscription/paypal/create" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const body = await readJsonBody(req);
      const result = await createPayPalSubscription(
        userId,
        body.tier,
        body.returnUrl,
        body.cancelUrl
      );
      sendJson(res, 200, result, req);
      return;
    }

    if (url.pathname === "/api/subscription/paypal/complete" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const body = await readJsonBody(req);
      const account = await completePayPalSubscription(userId, body.subscriptionId);
      sendJson(res, 200, { account: publicAccount(account) }, req);
      return;
    }

    if (url.pathname === "/api/weather/current" && req.method === "GET") {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      const city = url.searchParams.get("city");
      const province = url.searchParams.get("province");

      const weather = await getCurrentWeather({
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
        city: city || undefined,
        province: province || undefined,
      });

      sendJson(res, 200, weather, req);
      return;
    }

    if (url.pathname === "/api/weather/rainviewer" && req.method === "GET") {
      const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!response.ok) {
        throw new Error("RainViewer API unavailable");
      }
      const data = await response.json();
      const radarFrame = data?.radar?.past?.at(-1) || null;
      const cloudFrame = data?.satellite?.infrared?.at(-1) || null;
      sendJson(
        res,
        200,
        {
          radarPath: radarFrame?.path || null,
          cloudPath: cloudFrame?.path || null,
          generatedAt: data?.generated || null,
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/notifications/preferences") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }

      if (req.method === "GET") {
        const user = getAccountById(userId);
        sendJson(
          res,
          200,
          {
            preferences: getPreferences(user),
            smsConfigured: smsConfigured(),
          },
          req
        );
        return;
      }

      if (req.method === "PUT" || req.method === "PATCH") {
        const body = await readJsonBody(req);
        const preferences = updatePreferences(userId, body);
        sendJson(res, 200, { preferences, smsConfigured: smsConfigured() }, req);
        return;
      }
    }

    if (url.pathname === "/api/notifications" && req.method === "GET") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }

      const notifications = getInbox(userId);
      sendJson(
        res,
        200,
        {
          count: notifications.length,
          unread: notifications.filter((item) => !item.read).length,
          notifications,
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/notifications/read" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }

      const body = await readJsonBody(req);
      const notifications = markNotificationsRead(userId, body.notificationId);
      sendJson(
        res,
        200,
        {
          unread: notifications.filter((item) => !item.read).length,
          notifications,
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/past-tornadoes" && req.method === "GET") {
      const forceRefresh = url.searchParams.get("refresh") === "true";
      const {
        events,
        fetchedAt,
        source,
        fromCache,
        stale,
        periodDays,
        periodStart,
        periodEnd,
        newsArticles,
      } = await getPastTornadoes({
        forceRefresh,
      });
      const province = url.searchParams.get("province");

      const filtered = events.filter((event) => {
        const matchesProvince = !province || event.province === province;
        return matchesProvince;
      });

      sendJson(
        res,
        200,
        {
          count: filtered.length,
          fetchedAt,
          source,
          fromCache,
          stale: Boolean(stale),
          periodDays,
          periodStart,
          periodEnd,
          newsArticles: newsArticles || [],
          events: filtered,
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "GET") {
      const rating = url.searchParams.get("rating") || undefined;
      sendJson(
        res,
        200,
        {
          stats: feedbackStats(),
          feedback: listFeedback({ rating }),
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/feedback" && req.method === "POST") {
      const body = await readJsonBody(req);
      const item = createFeedback(body);
      sendJson(
        res,
        201,
        {
          feedback: item,
          stats: feedbackStats(),
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/storms/posts" && req.method === "GET") {
      const userId = getUserIdFromRequest(req);
      sendJson(res, 200, { posts: listPosts(userId) }, req);
      return;
    }

    if (url.pathname === "/api/storms/posts" && req.method === "POST") {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }
      const body = await readJsonBody(req);
      const post = createPost(userId, body);
      sendJson(res, 201, { post }, req);
      return;
    }

    const stormPostMatch = url.pathname.match(
      /^\/api\/storms\/posts\/([^/]+)(\/image|\/like|\/comments|\/report)?$/
    );

    if (stormPostMatch) {
      const postId = stormPostMatch[1];
      const action = stormPostMatch[2] || "";

      if (action === "/image" && req.method === "GET") {
        const image = getPostImage(postId);
        const buffer = readFileSync(image.path);
        sendBinary(res, 200, buffer, image.mime, req);
        return;
      }

      const userId = getUserIdFromRequest(req);
      if (!userId) {
        sendJson(res, 401, { error: "Not authenticated" }, req);
        return;
      }

      if (action === "/like" && req.method === "POST") {
        const post = toggleLike(postId, userId);
        sendJson(res, 200, { post }, req);
        return;
      }

      if (action === "/comments" && req.method === "POST") {
        const body = await readJsonBody(req);
        const post = addComment(postId, userId, body.text);
        sendJson(res, 200, { post }, req);
        return;
      }

      if (action === "/report" && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = reportPost(postId, userId, body.reason);
        sendJson(res, 200, result, req);
        return;
      }

      if (!action && req.method === "DELETE") {
        const result = deletePost(postId, userId);
        sendJson(res, 200, result, req);
        return;
      }
    }

    if (url.pathname === "/api/stats") {
      const { alerts, fetchedAt, fromCache, stale } = await getAlerts();
      sendJson(
        res,
        200,
        {
          ...buildStats(alerts),
          fetchedAt,
          fromCache,
          stale: Boolean(stale),
        },
        req
      );
      return;
    }

    if (url.pathname === "/api/alerts") {
      const forceRefresh = url.searchParams.get("refresh") === "true";
      const { alerts, fetchedAt, fromCache, stale } = await getAlerts({
        forceRefresh,
      });

      sendJson(
        res,
        200,
        {
          count: alerts.length,
          fetchedAt,
          fromCache,
          stale: Boolean(stale),
          stats: buildStats(alerts),
          source: "Environment and Climate Change Canada",
          pollIntervalMs: getPollIntervalMs(alerts),
          alerts,
        },
        req
      );
      return;
    }

    if (tryServeStatic(req, res, url)) return;

    sendJson(res, 404, { error: "Not found" }, req);
  } catch (error) {
    console.error(error);
    const status = error.message?.includes("already exists") ||
      error.message?.includes("required") ||
      error.message?.includes("valid") ||
      error.message?.includes("Invalid") ||
      error.message?.includes("at least") ||
      error.message?.includes("Upgrade") ||
      error.message?.includes("Unknown") ||
      error.message?.includes("not found") ||
      error.message?.includes("Choose") ||
      error.message?.includes("PayPal") ||
      error.message?.includes("checkout") ||
      error.message?.includes("subscription")
      ? 400
      : 502;
    sendJson(
      res,
      status,
      {
        error: status === 400 ? error.message : "Request failed",
        message: error.message,
      },
      req
    );
  }
}

export { handleRequest };

if (!SERVERLESS) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Canada Tornado Tracker API running at http://localhost:${PORT}`
    );
    if (existsSync(FRONTEND_DIST)) {
      console.log("Serving frontend from frontend/dist");
    }
    if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
      console.error(
        "WARNING: Set AUTH_SECRET in backend/.env before production use"
      );
    }
    if (paypalConfigured()) {
      const mode = process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
      console.log(`PayPal: ${mode} mode`);
      if (process.env.NODE_ENV === "production" && mode !== "live") {
        console.warn(
          "PayPal: production is running in sandbox mode — set PAYPAL_MODE=live for real billing"
        );
      }
    }
    if (!smsConfigured()) {
      console.log(
        "SMS: add Twilio credentials to backend/.env to enable text alerts"
      );
    }
    if (!paypalConfigured()) {
      console.log(
        "PayPal: add credentials to backend/.env to enable paid subscriptions"
      );
    }
    runNotificationCheck();
  });
}