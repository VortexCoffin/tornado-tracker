import {
  parseLocationInput,
  provinceMatches,
  PROVINCE_CODES,
} from "./locations.js";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CACHE_TTL_MS = 10 * 60 * 1000;

const weatherCache = new Map();

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "surface_pressure",
  "cloud_cover",
  "dew_point_2m",
].join(",");

const WEATHER_LABELS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

function cacheKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function readCache(lat, lng) {
  const entry = weatherCache.get(cacheKey(lat, lng));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

function writeCache(lat, lng, data) {
  weatherCache.set(cacheKey(lat, lng), {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function weatherLabel(code) {
  return WEATHER_LABELS[code] || "Current conditions";
}

function windCompass(degrees) {
  if (degrees == null || Number.isNaN(degrees)) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(degrees / 45) % 8];
}

function round(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildStormNote(current) {
  const notes = [];
  const code = current.weather_code;
  const humidity = current.relative_humidity_2m;
  const wind = current.wind_speed_10m;
  const gusts = current.wind_gusts_10m;

  if (code >= 95) notes.push("Thunderstorms in the area — stay alert.");
  else if (code >= 80) notes.push("Showers nearby — conditions can change fast.");
  else if (humidity >= 75 && current.temperature_2m >= 20) {
    notes.push("Warm and humid — good setup for storm development.");
  } else if (wind >= 40 || (gusts && gusts >= 55)) {
    notes.push("Windy conditions — severe weather may be possible.");
  } else if (current.cloud_cover >= 70) {
    notes.push("Cloudy skies — watch the radar if storms are forecast.");
  } else {
    notes.push("Calm for now — keep an eye on the live alert map.");
  }

  return notes[0];
}

async function searchCanadianPlaces(name) {
  const params = new URLSearchParams({
    name,
    count: "20",
    language: "en",
    format: "json",
  });

  const response = await fetch(`${GEOCODE_URL}?${params}`);
  if (!response.ok) {
    throw new Error("Location search failed");
  }

  const data = await response.json();
  return (data.results || []).filter(
    (item) => item.country_code === "CA" || item.country === "Canada"
  );
}

export async function geocodeLocation(city, province) {
  const parsed = parseLocationInput(city, province);
  const name = parsed.city;
  const provinceCode = parsed.province;

  if (!name) throw new Error("City name is required");

  const results = await searchCanadianPlaces(name);

  if (results.length === 0) {
    throw new Error(`Could not find "${name}" in Canada`);
  }

  let best = results[0];
  if (provinceCode) {
    const provincialMatch = results.find((item) =>
      provinceMatches(item.admin1, provinceCode)
    );

    if (provincialMatch) {
      best = provincialMatch;
    } else {
      const provinceName = PROVINCE_CODES[provinceCode] || provinceCode;
      throw new Error(
        `Found "${name}" in Canada, but not in ${provinceName}. Check the province or try a more specific name.`
      );
    }
  }

  return {
    name: best.name,
    province: best.admin1 || provinceCode || "",
    lat: best.latitude,
    lng: best.longitude,
  };
}

export async function getCurrentWeather({ lat, lng, city, province } = {}) {
  let location = null;

  if (city) {
    location = await geocodeLocation(city, province);
    lat = location.lat;
    lng = location.lng;
  } else {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Latitude and longitude are required");
    }
  }

  const cached = readCache(lat, lng);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: CURRENT_FIELDS,
    hourly:
      "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,precipitation",
    forecast_hours: "12",
    timezone: "auto",
  });

  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) {
    throw new Error("Weather service unavailable");
  }

  const data = await response.json();
  const current = data.current || {};
  const placeName =
    location?.name ||
    (city ? String(city).trim() : `${round(lat, 2)}°, ${round(lng, 2)}°`);

  const payload = {
    location: {
      name: placeName,
      province: location?.province || province || "",
      lat: data.latitude ?? lat,
      lng: data.longitude ?? lng,
    },
    fetchedAt: new Date().toISOString(),
    timezone: data.timezone,
    conditions: weatherLabel(current.weather_code),
    stormNote: buildStormNote(current),
    current: {
      temperature: round(current.temperature_2m, 1),
      feelsLike: round(current.apparent_temperature, 1),
      humidity: round(current.relative_humidity_2m, 0),
      dewPoint: round(current.dew_point_2m, 1),
      precipitation: round(current.precipitation, 1),
      cloudCover: round(current.cloud_cover, 0),
      windSpeed: round(current.wind_speed_10m, 1),
      windGusts: round(current.wind_gusts_10m, 1),
      windDirection: windCompass(current.wind_direction_10m),
      pressure: round(current.surface_pressure, 0),
      observedAt: current.time,
    },
    units: {
      temperature: "°C",
      wind: "km/h",
      pressure: "hPa",
      precipitation: "mm",
    },
    hourly: buildHourlyForecast(data.hourly),
    source: "Open-Meteo",
    fromCache: false,
  };

  writeCache(lat, lng, payload);
  return payload;
}

function buildHourlyForecast(hourly) {
  if (!hourly?.time?.length) return [];

  return hourly.time.slice(0, 12).map((time, index) => ({
    time,
    temperature: round(hourly.temperature_2m?.[index], 0),
    precipitationChance: round(hourly.precipitation_probability?.[index], 0),
    precipitation: round(hourly.precipitation?.[index], 1),
    windSpeed: round(hourly.wind_speed_10m?.[index], 0),
    conditions: weatherLabel(hourly.weather_code?.[index]),
  }));
}