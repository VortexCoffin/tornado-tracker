export const TIERS = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    interval: "month",
    description: "Live alerts with the standard map.",
    overlays: ["standard", "radar"],
  },
  storm: {
    id: "storm",
    name: "Storm Tracker",
    price: 2.99,
    interval: "month",
    description: "Satellite, dark, and terrain map overlays.",
    overlays: ["standard", "satellite", "dark", "terrain", "radar"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 4.99,
    interval: "month",
    description: "All overlays including live radar and cloud cover.",
    overlays: ["standard", "satellite", "dark", "terrain", "radar", "clouds"],
  },
};

export const OVERLAYS = {
  standard: {
    id: "standard",
    name: "Standard",
    description: "OpenStreetMap streets and labels",
    minTier: "free",
    type: "base",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    id: "satellite",
    name: "Satellite",
    description: "High-resolution satellite imagery",
    minTier: "storm",
    type: "base",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  dark: {
    id: "dark",
    name: "Dark",
    description: "Low-light tactical map style",
    minTier: "storm",
    type: "base",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  terrain: {
    id: "terrain",
    name: "Terrain",
    description: "Topographic hills and elevation",
    minTier: "storm",
    type: "base",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, SRTM | Map style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  radar: {
    id: "radar",
    name: "Radar",
    description: "Live precipitation radar overlay",
    minTier: "free",
    type: "overlay",
    opacity: 0.65,
    provider: "rainviewer-radar",
    attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
  },
  clouds: {
    id: "clouds",
    name: "Clouds",
    description: "Infrared satellite cloud cover overlay",
    minTier: "pro",
    type: "overlay",
    opacity: 0.55,
    provider: "rainviewer-satellite",
    attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
  },
};

const TIER_RANK = { free: 0, storm: 1, pro: 2 };

export function defaultSubscription() {
  return {
    tier: "free",
    status: "active",
    provider: null,
    paypalSubscriptionId: null,
    startedAt: new Date().toISOString(),
    expiresAt: null,
  };
}

export function tierIncludes(tierId, overlayId) {
  const tier = TIERS[tierId] || TIERS.free;
  return tier.overlays.includes(overlayId);
}

export function canUseOverlay(tierId, overlayId) {
  const overlay = OVERLAYS[overlayId];
  if (!overlay) return false;
  const userRank = TIER_RANK[tierId] ?? 0;
  const requiredRank = TIER_RANK[overlay.minTier] ?? 0;
  return userRank >= requiredRank;
}

export function listOverlaysForTier(tierId) {
  return Object.values(OVERLAYS).map((overlay) => ({
    ...overlay,
    unlocked: canUseOverlay(tierId, overlay.id),
    requiredTier: overlay.minTier,
    requiredTierName: TIERS[overlay.minTier]?.name || "Free",
  }));
}

export function listPlans() {
  return Object.values(TIERS).map((tier) => ({
    ...tier,
    overlays: tier.overlays.map((id) => ({
      id,
      name: OVERLAYS[id]?.name || id,
    })),
  }));
}

export function subscribeToTier(currentTier, nextTier) {
  if (!TIERS[nextTier]) {
    throw new Error("Unknown subscription plan");
  }

  if (nextTier === "free") {
    return {
      tier: "free",
      status: "active",
      provider: null,
      paypalSubscriptionId: null,
      startedAt: new Date().toISOString(),
      expiresAt: null,
    };
  }

  throw new Error("Paid plans require PayPal checkout");
}