import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const CACHE_FILE = join(DATA_DIR, "recent-tornadoes-cache.json");

const PERIOD_DAYS = 30;
const CACHE_TTL_MS = 60 * 60 * 1000;

const NTP_QUERY_URL =
  "https://services.arcgis.com/rGKxabTU9mcXMw7k/ArcGIS/rest/services/NTP_Event_Summaries_Dashboard/FeatureServer/0/query";

const NEWS_FEEDS = [
  {
    name: "Google News",
    url: "https://news.google.com/rss/search?q=Canada+tornado+when:30d&hl=en-CA&gl=CA&ceid=CA:en",
  },
  {
    name: "CBC News",
    url: "https://www.cbc.ca/cmlink/rss-topstories",
  },
];

const PROVINCE_MAP = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "nova scotia": "NS",
  "northwest territories": "NT",
  nunavut: "NU",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readCache() {
  ensureDataDir();
  if (!existsSync(CACHE_FILE)) return null;
  return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
}

function writeCache(payload) {
  ensureDataDir();
  writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2));
}

function periodBounds() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - PERIOD_DAYS);
  return { start, end, startMs: start.getTime(), endMs: end.getTime() };
}

function normalizeProvince(value) {
  const raw = String(value || "").trim();
  if (!raw) return "CA";
  if (raw.length === 2) return raw.toUpperCase();
  return PROVINCE_MAP[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

function parseRating(damage) {
  const text = String(damage || "").toLowerCase();
  if (!text || text === "pending") return "Pending";
  const match = text.match(/ef(\d)/);
  if (match) return `EF${match[1]}`;
  return "Unknown";
}

function formatDataSources(sources) {
  if (!sources) return "";
  return String(sources)
    .split(",")
    .map((item) =>
      item
        .replace(/_/g, " ")
        .replace(/twitter eg/gi, "Twitter")
        .replace(/facebook eg/gi, "Facebook")
        .trim()
    )
    .filter(Boolean)
    .join(", ");
}

function destinationPoint(lat, lng, distanceKm, bearingDeg) {
  const radius = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angular = distanceKm / radius;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

function computeDissipation(touchdown, trackLengthKm, motionFromDeg) {
  if (!trackLengthKm || trackLengthKm <= 0 || motionFromDeg == null) {
    return { ...touchdown };
  }
  const bearing = (motionFromDeg + 180) % 360;
  return destinationPoint(touchdown.lat, touchdown.lng, trackLengthKm, bearing);
}

function formatEventDate(attrs) {
  if (attrs._date) {
    return new Date(attrs._date).toISOString().slice(0, 10);
  }
  if (attrs.Year && attrs.month && attrs.day) {
    const month = String(attrs.month).padStart(2, "0");
    const day = String(attrs.day).padStart(2, "0");
    return `${attrs.Year}-${month}-${day}`;
  }
  return "unknown";
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml, sourceName) {
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemRegex) || [];

  for (const block of blocks) {
    const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    const link = stripHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
    const pubDate = stripHtml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);
    const description = stripHtml(
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]
    );

    if (!title || !link) continue;

    const text = `${title} ${description}`.toLowerCase();
    if (!text.includes("tornado")) continue;
    if (!text.includes("canada") && !text.match(/\b(ab|bc|mb|sk|on|qc|ns|nb|nl|pe|yt|nt|nu)\b/)) {
      const canadianHints = [
        "saskatchewan",
        "manitoba",
        "alberta",
        "ontario",
        "quebec",
        "oxbow",
        "winnipeg",
        "regina",
        "kindersley",
        "denzil",
        "rossburn",
      ];
      if (!canadianHints.some((hint) => text.includes(hint))) continue;
    }

    const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;
    items.push({
      id: link,
      title,
      url: link,
      summary: description.slice(0, 280),
      source: sourceName,
      publishedAt,
    });
  }

  return items;
}

async function fetchNewsArticles({ startMs }) {
  const articles = [];

  for (const feed of NEWS_FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": "CanadaTornadoTracker/1.0" },
      });
      if (!response.ok) continue;

      const xml = await response.text();
      const items = parseRssItems(xml, feed.name).filter((item) => {
        if (!item.publishedAt) return true;
        return new Date(item.publishedAt).getTime() >= startMs;
      });

      articles.push(...items);
    } catch (error) {
      console.warn(`News feed failed (${feed.name}):`, error.message);
    }
  }

  const seen = new Set();
  return articles
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.publishedAt || 0).getTime() -
        new Date(a.publishedAt || 0).getTime()
    );
}

function matchNewsToEvent(event, articles) {
  const location = event.location.toLowerCase();
  const provinceName = Object.entries(PROVINCE_MAP).find(
    ([, code]) => code === event.province
  )?.[0];

  return articles.filter((article) => {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    if (text.includes(location)) return true;
    if (provinceName && text.includes(provinceName) && text.includes("tornado")) {
      return true;
    }
    return false;
  });
}

function buildNtpWhereClause(start) {
  const startYear = start.getFullYear();
  const startMonth = start.getMonth() + 1;
  const endYear = new Date().getFullYear();

  if (startYear === endYear) {
    return `Year = ${endYear} AND month >= ${startMonth}`;
  }

  return `(Year = ${startYear} AND month >= ${startMonth}) OR Year = ${endYear}`;
}

async function fetchNtpEvents({ startMs, start }) {
  const params = new URLSearchParams({
    where: buildNtpWhereClause(start),
    outFields: "*",
    orderByFields: "_date DESC",
    resultRecordCount: "200",
    f: "json",
  });

  const response = await fetch(`${NTP_QUERY_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`NTP API returned ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "NTP query failed");
  }

  const tornadoTypes = new Set(["tornado_over_land", "tornado_over_water"]);

  return (data.features || [])
    .filter((feature) => {
      const attrs = feature.attributes || {};
      if (!tornadoTypes.has(attrs.event_type)) return false;
      if (!attrs._date) return false;
      return attrs._date >= startMs;
    })
    .map((feature) => {
    const attrs = feature.attributes || {};
    const geometry = feature.geometry || {};
    const touchdown = { lat: geometry.y, lng: geometry.x };
    const dissipation = computeDissipation(
      touchdown,
      attrs.track_length,
      attrs.mean_motion_from
    );

    const location = attrs.event_name || attrs.location_description || "Unknown";
    const province = normalizeProvince(attrs.province);
    const date = formatEventDate(attrs);
    const rating = parseRating(attrs.damage);
    const newsPlaceholder = [];

    return {
      id: `ntp-${attrs.globalid || attrs.objectid}`,
      date,
      location,
      province,
      rating,
      touchdown,
      dissipation,
      fatalities: Number.parseInt(attrs.fatalities_text, 10) || 0,
      injuries: Number.parseInt(attrs.injuries, 10) || 0,
      trackLengthKm: attrs.track_length || null,
      maxWindKmh: attrs.max_wind_speed || null,
      parentStormType: attrs.parent_storm_type || null,
      classificationStatus: attrs.classification_status || null,
      dataSources: formatDataSources(attrs.initial_data_sources),
      ntpUrl: attrs.web_map_link || "https://www.uwo.ca/ntp/",
      source: "Northern Tornadoes Project",
      news: newsPlaceholder,
      summary: "",
      _matchLocation: location,
    };
  });
}

function buildSummary(event) {
  const parts = [
    `Confirmed tornado near ${event.location}, ${event.province} (${event.date}).`,
  ];

  if (event.rating && event.rating !== "Unknown") {
    parts.push(`Rating: ${event.rating}.`);
  }
  if (event.trackLengthKm) {
    parts.push(`Track length: ${event.trackLengthKm} km.`);
  }
  if (event.maxWindKmh) {
    parts.push(`Estimated peak winds: ${event.maxWindKmh} km/h.`);
  }
  if (event.parentStormType && event.parentStormType !== "N/A") {
    parts.push(`Storm type: ${event.parentStormType}.`);
  }
  if (event.dataSources) {
    parts.push(`Reported via ${event.dataSources}.`);
  }
  if (event.news?.length) {
    parts.push(`News coverage: ${event.news.map((item) => item.source).join(", ")}.`);
  }

  return parts.join(" ");
}

function normalizeEvents(events) {
  return events
    .map((event) => {
      const { _matchLocation, ...rest } = event;
      return {
        ...rest,
        summary: buildSummary(event),
        path: [
          [event.touchdown.lat, event.touchdown.lng],
          [event.dissipation.lat, event.dissipation.lng],
        ],
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function fetchRecentTornadoes() {
  const { start, end, startMs } = periodBounds();
  const [ntpEvents, newsArticles] = await Promise.all([
    fetchNtpEvents({ startMs, start }),
    fetchNewsArticles({ startMs }),
  ]);

  const enriched = ntpEvents.map((event) => {
    const news = matchNewsToEvent(event, newsArticles);
    return { ...event, news };
  });

  return {
    events: normalizeEvents(enriched),
    newsArticles,
    periodDays: PERIOD_DAYS,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    source:
      "Northern Tornadoes Project, Environment Canada (via NTP), CBC News, Google News",
  };
}

export async function getPastTornadoes({ forceRefresh = false } = {}) {
  const cache = readCache();
  const cacheValid =
    cache?.fetchedAt && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS;

  if (!forceRefresh && cacheValid && cache.events) {
    return {
      events: normalizeEvents(cache.events),
      fetchedAt: cache.fetchedAt,
      source: cache.source,
      periodDays: cache.periodDays,
      periodStart: cache.periodStart,
      periodEnd: cache.periodEnd,
      newsArticles: cache.newsArticles || [],
      fromCache: true,
    };
  }

  try {
    const result = await fetchRecentTornadoes();
    const fetchedAt = new Date().toISOString();

    writeCache({
      fetchedAt,
      ...result,
    });

    return {
      events: result.events,
      fetchedAt,
      source: result.source,
      periodDays: result.periodDays,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      newsArticles: result.newsArticles,
      fromCache: false,
    };
  } catch (error) {
    console.error("Recent tornado fetch failed:", error.message);

    if (cache?.events?.length) {
      return {
        events: normalizeEvents(cache.events),
        fetchedAt: cache.fetchedAt,
        source: cache.source,
        periodDays: cache.periodDays,
        periodStart: cache.periodStart,
        periodEnd: cache.periodEnd,
        newsArticles: cache.newsArticles || [],
        fromCache: true,
        stale: true,
      };
    }

    throw error;
  }
}